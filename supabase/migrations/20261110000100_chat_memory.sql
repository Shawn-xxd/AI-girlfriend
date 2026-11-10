BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261108000100') THEN RAISE EXCEPTION 'Level migration missing'; END IF;
  IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261110000100' AND checksum<>'de5d39ec61a98690699f4fa848e99085740ec9dbeda77da5803a0a1c69a306d3') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE TABLE IF NOT EXISTS public.companion_chat_memory (
  conversation_id uuid PRIMARY KEY REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '' CHECK(length(summary)<=2000),
  through_sequence integer NOT NULL DEFAULT 0 CHECK(through_sequence>=0),
  generation_id uuid,
  target_sequence integer,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.companion_memory_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('generation','output_moderation')),
  provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 64),
  model text NOT NULL CHECK(length(model) BETWEEN 1 AND 160),
  provider_response_id text CHECK(length(provider_response_id)<=256),
  input_tokens integer CHECK(input_tokens>=0),
  output_tokens integer CHECK(output_tokens>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(generation_id,phase)
);
CREATE INDEX IF NOT EXISTS companion_memory_usage_conversation_idx ON public.companion_memory_usage(conversation_id,created_at);
ALTER TABLE public.companion_chat_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_memory_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_chat_memory,public.companion_memory_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.companion_chat_memory TO service_role;
GRANT SELECT,INSERT ON public.companion_memory_usage TO service_role;

CREATE OR REPLACE FUNCTION public.companion_memory_context_v1(p_actor uuid,p_conversation uuid,p_limit integer DEFAULT 10,p_max_chars integer DEFAULT 24000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_max_chars IS NULL OR p_max_chars NOT BETWEEN 16000 AND 64000 THEN RAISE EXCEPTION 'INVALID_CONTEXT_LIMIT' USING ERRCODE='PT400'; END IF;
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
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
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.companion_finish_memory_v1(p_actor uuid,p_conversation uuid,p_generation uuid,p_summary text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_summary IS NOT NULL AND length(btrim(p_summary)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_SUMMARY' USING ERRCODE='PT400'; END IF;
  UPDATE public.companion_chat_memory SET summary=coalesce(p_summary,summary),
    through_sequence=CASE WHEN p_summary IS NULL THEN through_sequence ELSE target_sequence END,
    generation_id=NULL,target_sequence=NULL,lease_until=CASE WHEN p_summary IS NULL THEN clock_timestamp()+interval '60 seconds' ELSE NULL END,
    updated_at=clock_timestamp()
    WHERE conversation_id=p_conversation AND generation_id=p_generation AND lease_until>clock_timestamp();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.companion_record_memory_usage_v1(p_actor uuid,p_conversation uuid,p_generation uuid,p_phase text,p_provider text,p_model text,p_response_id text,p_input_tokens integer,p_output_tokens integer)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  PERFORM 1 FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.companion_memory_usage(conversation_id,generation_id,phase,provider,model,provider_response_id,input_tokens,output_tokens)
    VALUES(p_conversation,p_generation,p_phase,p_provider,p_model,p_response_id,p_input_tokens,p_output_tokens)
    ON CONFLICT(generation_id,phase) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
    SELECT id INTO result FROM public.companion_memory_usage WHERE conversation_id=p_conversation AND generation_id=p_generation AND phase=p_phase
      AND provider=p_provider AND model=p_model AND provider_response_id IS NOT DISTINCT FROM p_response_id
      AND input_tokens IS NOT DISTINCT FROM p_input_tokens AND output_tokens IS NOT DISTINCT FROM p_output_tokens;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMORY_USAGE_CONFLICT' USING ERRCODE='PT409'; END IF;
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.companion_reset_memory_on_delete_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.companion_conversations WHERE id=OLD.conversation_id FOR UPDATE;
  UPDATE public.companion_chat_memory SET summary='',through_sequence=0,generation_id=NULL,target_sequence=NULL,lease_until=NULL,updated_at=clock_timestamp()
    WHERE conversation_id=OLD.conversation_id AND (summary<>'' OR generation_id IS NOT NULL OR through_sequence<>0);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS companion_reset_memory_on_delete ON public.companion_messages;
CREATE TRIGGER companion_reset_memory_on_delete BEFORE DELETE ON public.companion_messages FOR EACH ROW EXECUTE FUNCTION public.companion_reset_memory_on_delete_v1();

REVOKE ALL ON FUNCTION public.companion_memory_context_v1(uuid,uuid,integer,integer),public.companion_claim_memory_v1(uuid,uuid,integer,integer),
  public.companion_finish_memory_v1(uuid,uuid,uuid,text),public.companion_record_memory_usage_v1(uuid,uuid,uuid,text,text,text,text,integer,integer),
  public.companion_reset_memory_on_delete_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_memory_context_v1(uuid,uuid,integer,integer),public.companion_claim_memory_v1(uuid,uuid,integer,integer),
  public.companion_finish_memory_v1(uuid,uuid,uuid,text),public.companion_record_memory_usage_v1(uuid,uuid,uuid,text,text,text,text,integer,integer),
  public.companion_reset_memory_on_delete_v1() TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum)
VALUES ('20261110000100', 'de5d39ec61a98690699f4fa848e99085740ec9dbeda77da5803a0a1c69a306d3') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
