BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261126130522') THEN RAISE EXCEPTION 'Character greeting migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261126140021' AND checksum<>'e8be3413afa35fcb838a7dd523b53c63b56dad0a47bff420de6d88933d50b416') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
ALTER TABLE public.companion_conversations ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS companion_conversations_active_character_idx ON public.companion_conversations(user_id,character_id) WHERE NOT archived;
ALTER TABLE public.companion_conversations DROP CONSTRAINT IF EXISTS companion_conversations_user_id_character_id_key;
CREATE INDEX IF NOT EXISTS companion_conversations_active_list_idx ON public.companion_conversations(user_id,created_at DESC,id) WHERE NOT archived;
CREATE TABLE IF NOT EXISTS public.companion_history_actions (
 user_id uuid NOT NULL REFERENCES public.companion_users(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 conversation_id uuid NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('clear','delete')),
 replacement_id uuid REFERENCES public.companion_conversations(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS companion_history_actions_conversation_idx ON public.companion_history_actions(conversation_id);
CREATE INDEX IF NOT EXISTS companion_history_actions_replacement_idx ON public.companion_history_actions(replacement_id);
ALTER TABLE public.companion_history_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_history_actions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.companion_history_actions TO service_role;

CREATE OR REPLACE FUNCTION public.companion_open_conversation_v1(p_actor uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companion_characters WHERE id=p_character AND published) THEN
    RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.companion_users(id) VALUES(p_actor) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.companion_conversations(user_id,character_id) VALUES(p_actor,p_character)
    ON CONFLICT(user_id,character_id) WHERE NOT archived DO UPDATE SET character_id=EXCLUDED.character_id RETURNING id INTO result;
  PERFORM public.companion_sync_progress_v1(p_actor,result);
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.companion_begin_turn_v1(p_actor uuid, p_conversation uuid, p_key uuid, p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE conv public.companion_conversations; turn public.companion_chat_turns; next_seq integer; original text;
BEGIN
  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE' USING ERRCODE = 'PT400';
  END IF;
  SELECT * INTO conv FROM public.companion_conversations WHERE id = p_conversation AND user_id = p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companion_characters WHERE id = conv.character_id AND published) THEN
    RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO turn FROM public.companion_chat_turns WHERE conversation_id = p_conversation AND request_key = p_key;
  IF FOUND THEN
    SELECT content INTO original FROM public.companion_messages WHERE turn_id = turn.id AND role = 'user';
    IF original IS DISTINCT FROM p_content THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = 'PT409'; END IF;
    IF turn.state IN ('completed', 'rejected') THEN
      RETURN jsonb_build_object('turnId', turn.id, 'state', turn.state, 'generationId', turn.generation_id);
    END IF;
    IF turn.state = 'pending' AND turn.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'GENERATION_IN_PROGRESS' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.companion_chat_turns
    WHERE conversation_id = p_conversation AND state = 'pending' AND lease_expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'GENERATION_IN_PROGRESS' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.companion_ai_attempts a SET state = 'interrupted', finished_at = clock_timestamp()
    FROM public.companion_chat_turns t WHERE a.id = t.generation_id AND a.state = 'pending'
      AND t.conversation_id = p_conversation AND t.state = 'pending';
  UPDATE public.companion_chat_turns SET state = 'failed', failure_reason = 'interrupted'
    WHERE conversation_id = p_conversation AND state = 'pending';
  IF turn.id IS NULL THEN
    INSERT INTO public.companion_chat_turns(conversation_id, request_key, state, generation_id, lease_expires_at)
      VALUES (p_conversation, p_key, 'pending', gen_random_uuid(), clock_timestamp() + interval '180 seconds') RETURNING * INTO turn;
    UPDATE public.companion_conversations SET next_sequence = next_sequence + 1 WHERE id = p_conversation RETURNING next_sequence INTO next_seq;
    INSERT INTO public.companion_messages(conversation_id, turn_id, role, content, sequence)
      VALUES (p_conversation, turn.id, 'user', p_content, next_seq);
  ELSE
    UPDATE public.companion_chat_turns SET state = 'pending', generation_id = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '180 seconds', failure_reason = NULL
      WHERE id = turn.id RETURNING * INTO turn;
  END IF;
  INSERT INTO public.companion_ai_attempts(id, turn_id, state) VALUES (turn.generation_id, turn.id, 'pending');
  RETURN jsonb_build_object('turnId', turn.id, 'state', turn.state, 'generationId', turn.generation_id);
END $$;
CREATE OR REPLACE FUNCTION public.companion_complete_turn_v1(
  p_actor uuid, p_turn uuid, p_generation uuid, p_text text, p_model text,
  p_response_id text, p_input_tokens integer, p_output_tokens integer
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE conv_id uuid; turn public.companion_chat_turns; next_seq integer;
BEGIN
  SELECT conversation_id INTO conv_id FROM public.companion_chat_turns WHERE id = p_turn;
  PERFORM 1 FROM public.companion_conversations WHERE id = conv_id AND user_id = p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO turn FROM public.companion_chat_turns WHERE id = p_turn FOR UPDATE;
  IF turn.state <> 'pending' OR turn.generation_id <> p_generation OR turn.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'GENERATION_LEASE_LOST' USING ERRCODE = 'PT409';
  END IF;
  IF p_text IS NULL OR length(btrim(p_text)) NOT BETWEEN 1 AND 12000 OR p_model IS NULL OR length(p_model) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_COMPLETION' USING ERRCODE = 'PT400';
  END IF;
  UPDATE public.companion_conversations SET next_sequence = next_sequence + 1 WHERE id = conv_id RETURNING next_sequence INTO next_seq;
  INSERT INTO public.companion_messages(conversation_id, turn_id, role, content, sequence)
    VALUES (conv_id, p_turn, 'assistant', p_text, next_seq);
  UPDATE public.companion_chat_turns SET state = 'completed', completed_at = clock_timestamp(), failure_reason = NULL, model = p_model,
    provider_response_id = p_response_id, input_tokens = p_input_tokens, output_tokens = p_output_tokens WHERE id = p_turn;
  UPDATE public.companion_ai_attempts SET state = 'completed', model = p_model,
    provider_response_id = p_response_id, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    finished_at = clock_timestamp() WHERE id = p_generation AND turn_id = p_turn AND state = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTEMPT_STATE_INVALID' USING ERRCODE = 'PT409'; END IF;
  RETURN p_turn;
END $$;
CREATE OR REPLACE FUNCTION public.companion_sync_progress_v1(p_actor uuid,p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress;
  config jsonb; achieved integer; item public.companion_photos; unlock uuid; seq integer;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  -- Keep character and shared global-config locks before the progress row.
  PERFORM 1 FROM public.companion_characters WHERE id=conv.character_id FOR SHARE;
  SELECT rules INTO config FROM public.companion_global_level_config WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GLOBAL_LEVEL_RULES_MISSING' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.companion_user_character_progress(user_id,character_id) VALUES(p_actor,conv.character_id)
    ON CONFLICT(user_id,character_id) DO NOTHING;
  SELECT * INTO progress FROM public.companion_user_character_progress WHERE user_id=p_actor AND character_id=conv.character_id FOR UPDATE;
  SELECT max((r->>'level')::integer) INTO achieved FROM jsonb_array_elements(config) r
    WHERE (r->>'requiredCount')::integer<=progress.effective_chat_count;
  UPDATE public.companion_user_character_progress SET level=greatest(level,achieved),updated_at=clock_timestamp()
    WHERE user_id=p_actor AND character_id=conv.character_id RETURNING * INTO progress;
  FOR item IN SELECT * FROM public.companion_photos WHERE character_id=conv.character_id AND kind='level'
    AND published AND review_status='approved' AND required_level<=progress.level ORDER BY required_level,id FOR SHARE LOOP
    unlock:=NULL;
    INSERT INTO public.companion_photo_unlocks(user_id,character_id,photo_id,earned_level)
      VALUES(p_actor,conv.character_id,item.id,progress.level)
      ON CONFLICT(user_id,photo_id) DO NOTHING RETURNING id INTO unlock;
    IF unlock IS NOT NULL THEN
      UPDATE public.companion_conversations SET next_sequence=next_sequence+1 WHERE id=p_conversation RETURNING next_sequence INTO seq;
      INSERT INTO public.companion_photo_messages(conversation_id,unlock_id,sequence) VALUES(p_conversation,unlock,seq);
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.companion_unlock_diamond_photo_v1(p_actor uuid,p_conversation uuid,p_photo uuid,p_key uuid,p_expected_price integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE character uuid; photo public.companion_photos; prior public.companion_photo_unlock_requests; charge integer:=0; tx uuid;
BEGIN
  IF p_key IS NULL OR p_expected_price IS NULL OR p_expected_price NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_UNLOCK' USING ERRCODE='PT400'; END IF;
  SELECT character_id INTO character FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM public.companion_wallet_snapshot_v1(p_actor);
  PERFORM 1 FROM public.companion_wallets WHERE user_id=p_actor FOR UPDATE;
  SELECT * INTO photo FROM public.companion_photos WHERE id=p_photo AND character_id=character AND kind='diamond' AND review_status='approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PHOTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO prior FROM public.companion_photo_unlock_requests WHERE user_id=p_actor AND request_key=p_key;
  IF FOUND THEN
    IF prior.photo_id<>p_photo OR prior.expected_price<>p_expected_price THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('photoId',p_photo,'chargedDiamonds',prior.charged_diamonds,'wallet',public.companion_wallet_snapshot_v1(p_actor));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companion_photo_unlocks WHERE user_id=p_actor AND photo_id=p_photo) THEN
    IF NOT photo.published OR photo.diamond_price IS NULL THEN RAISE EXCEPTION 'PHOTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF photo.diamond_price<>p_expected_price THEN RAISE EXCEPTION 'PRICE_CHANGED' USING ERRCODE='PT409'; END IF;
    charge:=photo.diamond_price;
    INSERT INTO public.companion_wallet_transactions(user_id,kind,amount,balance_after,source_key,photo_id)
      VALUES(p_actor,'spend',-charge,0,'photo/'||p_actor::text||'/'||p_key::text,p_photo) RETURNING id INTO tx;
    INSERT INTO public.companion_user_character_progress(user_id,character_id) VALUES(p_actor,character) ON CONFLICT DO NOTHING;
    INSERT INTO public.companion_photo_unlocks(user_id,character_id,photo_id,earned_level,unlock_kind,wallet_transaction_id)
      VALUES(p_actor,character,p_photo,NULL,'diamond',tx);
  END IF;
  INSERT INTO public.companion_photo_unlock_requests(user_id,request_key,photo_id,expected_price,charged_diamonds)
    VALUES(p_actor,p_key,p_photo,p_expected_price,charge);
  RETURN jsonb_build_object('photoId',p_photo,'chargedDiamonds',charge,'wallet',public.companion_wallet_snapshot_v1(p_actor));
END $$;
CREATE OR REPLACE FUNCTION public.companion_memory_context_v1(p_actor uuid,p_conversation uuid,p_limit integer DEFAULT 10,p_max_chars integer DEFAULT 24000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_max_chars IS NULL OR p_max_chars NOT BETWEEN 16000 AND 64000 THEN RAISE EXCEPTION 'INVALID_CONTEXT_LIMIT' USING ERRCODE='PT400'; END IF;
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor AND NOT archived;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  WITH pairs AS (
    SELECT t.id,max(m.sequence) AS last_sequence,sum(length(m.content)) AS chars
      FROM public.companion_chat_turns t JOIN public.companion_messages m ON m.turn_id=t.id
      WHERE t.conversation_id=p_conversation AND t.state='completed' GROUP BY t.id HAVING count(*)=2
  ), recent AS (SELECT * FROM pairs ORDER BY last_sequence DESC LIMIT p_limit),
  budget AS (SELECT *,sum(chars) OVER(ORDER BY last_sequence DESC) AS total FROM recent)
  SELECT jsonb_build_object('summary',coalesce((SELECT summary FROM public.companion_chat_memory WHERE conversation_id=p_conversation),''),
    'messages',coalesce(jsonb_agg(jsonb_build_object('role',m.role,'content',m.content) ORDER BY m.sequence),'[]'::jsonb)) INTO result
    FROM budget b JOIN public.companion_messages m ON m.turn_id=b.id WHERE b.total<=p_max_chars;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.companion_claim_memory_v1(p_actor uuid,p_conversation uuid,p_batch integer DEFAULT 10,p_max_chars integer DEFAULT 24000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE memory public.companion_chat_memory; target integer; payload jsonb; candidate_count integer; candidate_chars bigint; generation uuid;
BEGIN
  IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 20 OR p_max_chars IS NULL OR p_max_chars NOT BETWEEN 16000 AND 64000 THEN RAISE EXCEPTION 'INVALID_MEMORY_LIMIT' USING ERRCODE='PT400'; END IF;
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.companion_chat_memory(conversation_id) VALUES(p_conversation) ON CONFLICT DO NOTHING;
  SELECT * INTO memory FROM public.companion_chat_memory WHERE conversation_id=p_conversation FOR UPDATE;
  IF memory.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
  WITH pairs AS (
    SELECT t.id,max(m.sequence) AS last_sequence,sum(length(m.content)) AS chars
      FROM public.companion_chat_turns t JOIN public.companion_messages m ON m.turn_id=t.id
      WHERE t.conversation_id=p_conversation AND t.state='completed' GROUP BY t.id HAVING count(*)=2
  ), candidates AS (SELECT * FROM pairs WHERE last_sequence>memory.through_sequence ORDER BY last_sequence LIMIT p_batch),
  budget AS (SELECT *,sum(chars) OVER(ORDER BY last_sequence) AS total FROM candidates)
  SELECT (SELECT count(*) FROM candidates),(SELECT coalesce(sum(chars),0) FROM candidates),max(b.last_sequence),
    coalesce(jsonb_agg(jsonb_build_object('role',m.role,'content',m.content) ORDER BY m.sequence),'[]'::jsonb)
    INTO candidate_count,candidate_chars,target,payload
    FROM budget b JOIN public.companion_messages m ON m.turn_id=b.id WHERE b.total<=p_max_chars;
  IF target IS NULL OR (candidate_count<p_batch AND candidate_chars<p_max_chars) THEN RETURN NULL; END IF;
  generation:=gen_random_uuid();
  UPDATE public.companion_chat_memory SET generation_id=generation,target_sequence=target,lease_until=clock_timestamp()+interval '180 seconds' WHERE conversation_id=p_conversation;
  RETURN jsonb_build_object('generationId',generation,'previousSummary',memory.summary,'messages',payload);
END $$;
CREATE OR REPLACE FUNCTION public.companion_snapshot_greeting_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 SELECT btrim(first_message) INTO NEW.greeting_message FROM public.companion_characters WHERE id=NEW.character_id AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_user_character_progress WHERE user_id=NEW.user_id AND character_id=NEW.character_id) THEN NEW.greeting_message:=''; END IF;
 RETURN NEW;
END $$;

-- Retire the old ID, physically remove text/photo messages and memory, keep earned rights and usage receipts.
CREATE OR REPLACE FUNCTION public.companion_change_history_v1(p_actor uuid,p_conversation uuid,p_key uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; prior public.companion_history_actions; replacement uuid;
BEGIN
 IF p_actor IS NULL OR p_key IS NULL OR p_action IS NULL OR p_action NOT IN ('clear','delete') THEN RAISE EXCEPTION 'INVALID_HISTORY_ACTION' USING ERRCODE='PT400'; END IF;
 SELECT * INTO prior FROM public.companion_history_actions WHERE user_id=p_actor AND request_key=p_key;
 IF prior.request_key IS NULL THEN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN
   SELECT * INTO prior FROM public.companion_history_actions WHERE user_id=p_actor AND request_key=p_key;
   IF prior.request_key IS NULL THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  ELSE
   UPDATE public.companion_ai_attempts a SET state='interrupted',finished_at=clock_timestamp()
    FROM public.companion_chat_turns t WHERE t.conversation_id=p_conversation AND a.turn_id=t.id AND a.state='pending';
   UPDATE public.companion_chat_turns SET state='failed',failure_reason='interrupted',lease_expires_at=clock_timestamp() WHERE conversation_id=p_conversation AND state='pending';
   DELETE FROM public.companion_messages WHERE conversation_id=p_conversation;
   DELETE FROM public.companion_photo_messages WHERE conversation_id=p_conversation;
   DELETE FROM public.companion_chat_memory WHERE conversation_id=p_conversation;
   UPDATE public.companion_conversations SET archived=true,greeting_message='' WHERE id=p_conversation;
   IF p_action='clear' THEN replacement:=public.companion_open_conversation_v1(p_actor,conv.character_id); END IF;
   INSERT INTO public.companion_history_actions(user_id,request_key,conversation_id,action,replacement_id)
    VALUES(p_actor,p_key,p_conversation,p_action,replacement) RETURNING * INTO prior;
  END IF;
 END IF;
 IF prior.conversation_id<>p_conversation OR prior.action<>p_action THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('action',prior.action,'conversationId',CASE WHEN EXISTS(SELECT 1 FROM public.companion_conversations WHERE id=prior.replacement_id AND user_id=p_actor AND NOT archived) THEN prior.replacement_id ELSE NULL END);
EXCEPTION WHEN unique_violation THEN
 SELECT * INTO prior FROM public.companion_history_actions WHERE user_id=p_actor AND request_key=p_key;
 IF prior.request_key IS NULL OR prior.conversation_id<>p_conversation OR prior.action<>p_action THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('action',prior.action,'conversationId',CASE WHEN EXISTS(SELECT 1 FROM public.companion_conversations WHERE id=prior.replacement_id AND user_id=p_actor AND NOT archived) THEN prior.replacement_id ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.companion_change_history_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_change_history_v1(uuid,uuid,uuid,text) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum) VALUES ('20261126140021', 'e8be3413afa35fcb838a7dd523b53c63b56dad0a47bff420de6d88933d50b416') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
