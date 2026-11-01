-- Provider-independent metering. Execute after the chat migration in DEVELOPMENT.
BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version = '20261101000200') THEN
    RAISE EXCEPTION 'Chat migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version = '20261101000300' AND checksum <> 'aaa6984cba7bac889d11895faab08d6a30fce1608d0e5a344496bdb5e2bd2f20') THEN
    RAISE EXCEPTION 'Migration checksum mismatch';
  END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE UNIQUE INDEX IF NOT EXISTS companion_ai_attempts_id_turn_idx ON public.companion_ai_attempts(id, turn_id);
CREATE TABLE IF NOT EXISTS public.companion_ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('input_moderation', 'generation', 'output_moderation')),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  provider_response_id text CHECK (length(provider_response_id) <= 256),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(generation_id, phase),
  FOREIGN KEY(generation_id, turn_id) REFERENCES public.companion_ai_attempts(id, turn_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS companion_ai_usage_events_turn_idx ON public.companion_ai_usage_events(turn_id, created_at);
ALTER TABLE public.companion_ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_ai_usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.companion_ai_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.companion_record_ai_usage_v1(
  p_actor uuid, p_turn uuid, p_generation uuid, p_phase text, p_provider text,
  p_model text, p_response_id text, p_input_tokens integer, p_output_tokens integer
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.companion_ai_attempts a
    JOIN public.companion_chat_turns t ON t.id = a.turn_id
    JOIN public.companion_conversations c ON c.id = t.conversation_id
    WHERE a.id = p_generation AND a.turn_id = p_turn AND c.user_id = p_actor
  ) THEN RAISE EXCEPTION 'ATTEMPT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.companion_ai_usage_events(turn_id, generation_id, phase, provider, model, provider_response_id, input_tokens, output_tokens)
    VALUES(p_turn, p_generation, p_phase, p_provider, p_model, p_response_id, p_input_tokens, p_output_tokens)
    ON CONFLICT(generation_id, phase) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN
    SELECT id INTO result FROM public.companion_ai_usage_events
      WHERE generation_id = p_generation AND phase = p_phase AND provider = p_provider AND model = p_model
      AND provider_response_id IS NOT DISTINCT FROM p_response_id
      AND input_tokens IS NOT DISTINCT FROM p_input_tokens AND output_tokens IS NOT DISTINCT FROM p_output_tokens;
    IF NOT FOUND THEN RAISE EXCEPTION 'USAGE_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'PT409'; END IF;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.companion_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.companion_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,text,integer,integer) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version, checksum)
VALUES ('20261101000300', 'aaa6984cba7bac889d11895faab08d6a30fce1608d0e5a344496bdb5e2bd2f20') ON CONFLICT (version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
