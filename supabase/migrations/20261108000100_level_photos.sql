-- Phase 3. Apply only after the three existing migrations in DEVELOPMENT.
BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version='20261101000300') THEN
    RAISE EXCEPTION 'Provider usage migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version='20261108000100' AND checksum <> '2fc6741ba18fe7512d30e10acef211b5f49ad8ea6f12952b4e15071f4c75401e') THEN
    RAISE EXCEPTION 'Migration checksum mismatch';
  END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE OR REPLACE FUNCTION public.companion_valid_level_rules_v1(p_rules jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; expected integer:=1; previous_count bigint:=-1; required_count bigint;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules)<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_rules) NOT BETWEEN 1 AND 1000 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
    IF jsonb_typeof(item)<>'object' OR NOT (item ?& ARRAY['level','requiredCount'])
      OR (item - 'level' - 'requiredCount')<>'{}'::jsonb
      OR jsonb_typeof(item->'level')<>'number' OR jsonb_typeof(item->'requiredCount')<>'number'
      OR (item->>'level')!~'^[0-9]{1,4}$' OR (item->>'requiredCount')!~'^[0-9]{1,10}$' THEN RETURN false; END IF;
    required_count:=(item->>'requiredCount')::bigint;
    IF (item->>'level')::integer<>expected OR required_count>2147483647
      OR required_count<=previous_count OR (expected=1 AND required_count<>0) THEN RETURN false; END IF;
    expected:=expected+1; previous_count:=required_count;
  END LOOP;
  RETURN true;
END $$;

CREATE TABLE IF NOT EXISTS public.companion_level_configs (
  character_id uuid PRIMARY KEY REFERENCES public.companion_characters(id) ON DELETE CASCADE,
  rules jsonb NOT NULL CHECK (public.companion_valid_level_rules_v1(rules)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.companion_user_character_progress (
  user_id uuid NOT NULL REFERENCES public.companion_users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.companion_characters(id) ON DELETE CASCADE,
  effective_chat_count integer NOT NULL DEFAULT 0 CHECK (effective_chat_count>=0),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,character_id)
);
-- Deliberately no FK to chat turns/messages: deleting history cannot erase earned progress.
CREATE TABLE IF NOT EXISTS public.companion_chat_count_events (
  turn_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  character_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,character_id) REFERENCES public.companion_user_character_progress(user_id,character_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS companion_chat_count_events_owner_idx ON public.companion_chat_count_events(user_id,character_id);
CREATE TABLE IF NOT EXISTS public.companion_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.companion_characters(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'level' CHECK (kind IN ('level','diamond')),
  title text NOT NULL DEFAULT 'PHOTO' CHECK(length(btrim(title)) BETWEEN 1 AND 64),
  required_level integer CHECK(required_level BETWEEN 1 AND 1000),
  object_key text NOT NULL CHECK(length(object_key) BETWEEN 1 AND 512 AND object_key !~ '(^/|(^|/)\.\.?(/|$)|[[:cntrl:]])'),
  review_status text NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','approved','rejected')),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,character_id),
  UNIQUE(object_key),
  CHECK ((kind='level' AND required_level IS NOT NULL) OR (kind='diamond' AND required_level IS NULL)),
  CHECK (NOT published OR review_status='approved')
);
CREATE INDEX IF NOT EXISTS companion_photos_character_level_idx ON public.companion_photos(character_id,required_level,id) WHERE published;
CREATE TABLE IF NOT EXISTS public.companion_photo_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_id uuid NOT NULL,
  photo_id uuid NOT NULL,
  earned_level integer NOT NULL CHECK(earned_level>=1),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,photo_id),
  FOREIGN KEY(user_id,character_id) REFERENCES public.companion_user_character_progress(user_id,character_id) ON DELETE CASCADE,
  FOREIGN KEY(photo_id,character_id) REFERENCES public.companion_photos(id,character_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.companion_photo_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  unlock_id uuid NOT NULL UNIQUE REFERENCES public.companion_photo_unlocks(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK(sequence>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,sequence)
);
CREATE INDEX IF NOT EXISTS companion_photo_messages_conversation_idx ON public.companion_photo_messages(conversation_id,sequence DESC);

ALTER TABLE public.companion_level_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_user_character_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_chat_count_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_photo_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_photo_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_level_configs,public.companion_user_character_progress,public.companion_chat_count_events,
  public.companion_photos,public.companion_photo_unlocks,public.companion_photo_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.companion_level_configs,public.companion_user_character_progress,public.companion_chat_count_events,
  public.companion_photos,public.companion_photo_unlocks,public.companion_photo_messages TO service_role;

CREATE OR REPLACE FUNCTION public.companion_protect_earned_photo_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (NEW.id,NEW.character_id,NEW.kind,NEW.required_level,NEW.object_key) IS DISTINCT FROM
     (OLD.id,OLD.character_id,OLD.kind,OLD.required_level,OLD.object_key)
     AND EXISTS(SELECT 1 FROM public.companion_photo_unlocks WHERE photo_id=OLD.id) THEN
    RAISE EXCEPTION 'EARNED_PHOTO_IMMUTABLE' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_protect_earned_photo ON public.companion_photos;
CREATE TRIGGER companion_protect_earned_photo BEFORE UPDATE ON public.companion_photos
  FOR EACH ROW EXECUTE FUNCTION public.companion_protect_earned_photo_v1();

CREATE OR REPLACE FUNCTION public.companion_validate_photo_message_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companion_conversations c JOIN public.companion_photo_unlocks u
    ON u.user_id=c.user_id AND u.character_id=c.character_id
    WHERE c.id=NEW.conversation_id AND u.id=NEW.unlock_id) THEN
    RAISE EXCEPTION 'PHOTO_OWNER_MISMATCH' USING ERRCODE='PT400';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_validate_photo_message ON public.companion_photo_messages;
CREATE TRIGGER companion_validate_photo_message BEFORE INSERT OR UPDATE ON public.companion_photo_messages
  FOR EACH ROW EXECUTE FUNCTION public.companion_validate_photo_message_v1();

CREATE OR REPLACE FUNCTION public.companion_set_level_rules_v1(p_character uuid,p_rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT public.companion_valid_level_rules_v1(p_rules) THEN RAISE EXCEPTION 'INVALID_LEVEL_RULES' USING ERRCODE='PT400'; END IF;
  PERFORM 1 FROM public.companion_characters WHERE id=p_character FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.companion_level_configs(character_id,rules) VALUES(p_character,p_rules)
    ON CONFLICT(character_id) DO UPDATE SET rules=EXCLUDED.rules,updated_at=clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION public.companion_sync_progress_v1(p_actor uuid,p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress;
  config jsonb; achieved integer; item public.companion_photos; unlock uuid; seq integer;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  -- All config writers take the character lock; different users retain shared access.
  PERFORM 1 FROM public.companion_characters WHERE id=conv.character_id FOR SHARE;
  INSERT INTO public.companion_level_configs(character_id,rules) VALUES(conv.character_id,'[{"level":1,"requiredCount":0}]')
    ON CONFLICT(character_id) DO NOTHING;
  SELECT rules INTO config FROM public.companion_level_configs WHERE character_id=conv.character_id;
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

CREATE OR REPLACE FUNCTION public.companion_open_conversation_v1(p_actor uuid,p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companion_characters WHERE id=p_character AND published) THEN
    RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.companion_users(id) VALUES(p_actor) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.companion_conversations(user_id,character_id) VALUES(p_actor,p_character)
    ON CONFLICT(user_id,character_id) DO UPDATE SET character_id=EXCLUDED.character_id RETURNING id INTO result;
  PERFORM public.companion_sync_progress_v1(p_actor,result);
  RETURN result;
END $$;

-- Backfill once from durable successful turns. No image/level is invented for old chats.
-- Block turn transitions until backfill and its counting trigger are installed together.
LOCK TABLE public.companion_chat_turns IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.companion_user_character_progress(user_id,character_id,effective_chat_count)
SELECT c.user_id,c.character_id,count(t.id)::integer FROM public.companion_conversations c
LEFT JOIN public.companion_chat_turns t ON t.conversation_id=c.id AND t.state='completed'
GROUP BY c.user_id,c.character_id ON CONFLICT(user_id,character_id) DO NOTHING;
INSERT INTO public.companion_chat_count_events(turn_id,user_id,character_id)
SELECT t.id,c.user_id,c.character_id FROM public.companion_chat_turns t
JOIN public.companion_conversations c ON c.id=t.conversation_id WHERE t.state='completed'
ON CONFLICT(turn_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.companion_count_completed_turn_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; inserted integer;
BEGIN
  IF NEW.state<>'completed' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.state='completed' THEN RETURN NEW; END IF; END IF;
  SELECT * INTO conv FROM public.companion_conversations WHERE id=NEW.conversation_id FOR UPDATE;
  IF (SELECT count(*) FROM public.companion_messages WHERE turn_id=NEW.id)<>2 THEN
    RAISE EXCEPTION 'COMPLETED_PAIR_REQUIRED' USING ERRCODE='PT409';
  END IF;
  INSERT INTO public.companion_user_character_progress(user_id,character_id) VALUES(conv.user_id,conv.character_id)
    ON CONFLICT(user_id,character_id) DO NOTHING;
  INSERT INTO public.companion_chat_count_events(turn_id,user_id,character_id) VALUES(NEW.id,conv.user_id,conv.character_id)
    ON CONFLICT(turn_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN
    UPDATE public.companion_user_character_progress SET effective_chat_count=effective_chat_count+1
      WHERE user_id=conv.user_id AND character_id=conv.character_id;
  END IF;
  PERFORM public.companion_sync_progress_v1(conv.user_id,conv.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_count_completed_turn ON public.companion_chat_turns;
CREATE TRIGGER companion_count_completed_turn AFTER INSERT OR UPDATE OF state ON public.companion_chat_turns
  FOR EACH ROW EXECUTE FUNCTION public.companion_count_completed_turn_v1();

CREATE OR REPLACE FUNCTION public.companion_progress_snapshot_v1(p_actor uuid,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress; upcoming jsonb;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO progress FROM public.companion_user_character_progress WHERE user_id=p_actor AND character_id=conv.character_id;
  SELECT jsonb_build_object('level',(r->>'level')::integer,'requiredCount',(r->>'requiredCount')::integer) INTO upcoming
    FROM public.companion_level_configs c CROSS JOIN LATERAL jsonb_array_elements(c.rules) r
    WHERE c.character_id=conv.character_id AND (r->>'level')::integer>coalesce(progress.level,1)
    ORDER BY (r->>'level')::integer LIMIT 1;
  RETURN jsonb_build_object('level',coalesce(progress.level,1),'effectiveChatCount',coalesce(progress.effective_chat_count,0),'nextLevel',upcoming);
END $$;

CREATE OR REPLACE FUNCTION public.companion_level_photos_v1(p_actor uuid,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE character uuid; result jsonb;
BEGIN
  SELECT character_id INTO character FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'requiredLevel',p.required_level,
    'unlocked',u.id IS NOT NULL,'available',true) ORDER BY p.required_level,p.id),'[]'::jsonb) INTO result
    FROM public.companion_photos p LEFT JOIN public.companion_photo_unlocks u ON u.photo_id=p.id AND u.user_id=p_actor
    WHERE p.character_id=character AND p.kind='level' AND (p.published OR u.id IS NOT NULL) AND p.review_status='approved';
  RETURN jsonb_build_object('photos',result,'progress',public.companion_progress_snapshot_v1(p_actor,p_conversation));
END $$;

CREATE OR REPLACE FUNCTION public.companion_timeline_v1(p_actor uuid,p_conversation uuid,p_before integer DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before IS NOT NULL AND p_before<=0) THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='PT400';
  END IF;
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  WITH entries AS (
    SELECT m.sequence,jsonb_build_object('kind','text','id',m.id,'turnId',m.turn_id,'requestKey',t.request_key,
      'role',m.role,'content',m.content,'sequence',m.sequence,'createdAt',m.created_at,'state',t.state,
      'leaseExpiresAt',CASE WHEN t.state='pending' THEN t.lease_expires_at ELSE NULL END) AS entry
      FROM public.companion_messages m JOIN public.companion_chat_turns t ON t.id=m.turn_id
      WHERE m.conversation_id=p_conversation
    UNION ALL
    SELECT m.sequence,jsonb_build_object('kind','photo','id',m.id,'role','assistant','sequence',m.sequence,'createdAt',m.created_at,
      'photo',jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'requiredLevel',p.required_level,
        'unlocked',true,'available',p.review_status='approved'))
      FROM public.companion_photo_messages m JOIN public.companion_photo_unlocks u ON u.id=m.unlock_id
      JOIN public.companion_photos p ON p.id=u.photo_id
      WHERE m.conversation_id=p_conversation AND u.user_id=p_actor
  ), page AS (SELECT * FROM entries WHERE p_before IS NULL OR sequence<p_before ORDER BY sequence DESC LIMIT p_limit+1),
  visible AS (SELECT * FROM page ORDER BY sequence DESC LIMIT p_limit)
  SELECT jsonb_build_object('entries',coalesce((SELECT jsonb_agg(entry ORDER BY sequence) FROM visible),'[]'::jsonb),
    'nextBefore',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN (SELECT min(sequence) FROM visible) ELSE NULL END,
    'progress',public.companion_progress_snapshot_v1(p_actor,p_conversation)) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.companion_valid_level_rules_v1(jsonb),public.companion_protect_earned_photo_v1(),
  public.companion_validate_photo_message_v1(),
  public.companion_set_level_rules_v1(uuid,jsonb),public.companion_sync_progress_v1(uuid,uuid),
  public.companion_count_completed_turn_v1(),public.companion_progress_snapshot_v1(uuid,uuid),
  public.companion_level_photos_v1(uuid,uuid),public.companion_timeline_v1(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_valid_level_rules_v1(jsonb),public.companion_protect_earned_photo_v1(),
  public.companion_validate_photo_message_v1(),
  public.companion_set_level_rules_v1(uuid,jsonb),public.companion_sync_progress_v1(uuid,uuid),
  public.companion_count_completed_turn_v1(),public.companion_progress_snapshot_v1(uuid,uuid),
  public.companion_level_photos_v1(uuid,uuid),public.companion_timeline_v1(uuid,uuid,integer,integer) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum)
VALUES ('20261108000100', '2fc6741ba18fe7512d30e10acef211b5f49ad8ea6f12952b4e15071f4c75401e') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
