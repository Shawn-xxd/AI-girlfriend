-- Phase 2 chat. Execute after the SDK foundation migration in DEVELOPMENT.
BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version = '20261101000100') THEN
    RAISE EXCEPTION 'Foundation migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companion_schema_migrations WHERE version = '20261101000200' AND checksum <> 'f9e63127e42e2572cd48cc713d45a72274b9f582ef34e3a462ee31918be1763a') THEN
    RAISE EXCEPTION 'Migration checksum mismatch';
  END IF;
END $$;
-- BEGIN MIGRATION BODY
ALTER TABLE public.companion_characters
  ADD COLUMN IF NOT EXISTS system_prompt text NOT NULL DEFAULT '' CHECK (length(system_prompt) <= 8000);

CREATE TABLE IF NOT EXISTS public.companion_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.companion_users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.companion_characters(id) ON DELETE RESTRICT,
  next_sequence integer NOT NULL DEFAULT 0 CHECK (next_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, character_id)
);
CREATE INDEX IF NOT EXISTS companion_conversations_user_created_idx
  ON public.companion_conversations(user_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS public.companion_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('pending', 'completed', 'failed', 'rejected')),
  generation_id uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  failure_reason text CHECK (failure_reason IN ('provider_unavailable', 'content_rejected', 'interrupted')),
  model text,
  provider_response_id text,
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, request_key),
  UNIQUE(id, conversation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS companion_chat_turns_one_pending_idx
  ON public.companion_chat_turns(conversation_id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS companion_chat_turns_conversation_state_idx
  ON public.companion_chat_turns(conversation_id, state, completed_at DESC);

CREATE TABLE IF NOT EXISTS public.companion_ai_attempts (
  id uuid PRIMARY KEY,
  turn_id uuid NOT NULL REFERENCES public.companion_chat_turns(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pending', 'completed', 'failed', 'rejected', 'interrupted')),
  model text,
  provider_response_id text,
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS companion_ai_attempts_turn_idx ON public.companion_ai_attempts(turn_id, created_at);
ALTER TABLE public.companion_ai_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_ai_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_ai_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.companion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.companion_conversations(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 12000),
  sequence integer NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, sequence),
  UNIQUE(turn_id, role),
  FOREIGN KEY(turn_id, conversation_id) REFERENCES public.companion_chat_turns(id, conversation_id) ON DELETE CASCADE
);
ALTER TABLE public.companion_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_conversations, public.companion_chat_turns, public.companion_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_conversations, public.companion_chat_turns, public.companion_messages TO service_role;

CREATE OR REPLACE FUNCTION public.companion_open_conversation_v1(p_actor uuid, p_character uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companion_characters WHERE id = p_character AND published) THEN
    RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.companion_users(id) VALUES (p_actor) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.companion_conversations(user_id, character_id) VALUES (p_actor, p_character)
  ON CONFLICT(user_id, character_id) DO UPDATE SET character_id = EXCLUDED.character_id
  RETURNING id INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.companion_begin_turn_v1(p_actor uuid, p_conversation uuid, p_key uuid, p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE conv public.companion_conversations; turn public.companion_chat_turns; next_seq integer; original text;
BEGIN
  IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE' USING ERRCODE = 'PT400';
  END IF;
  SELECT * INTO conv FROM public.companion_conversations WHERE id = p_conversation AND user_id = p_actor FOR UPDATE;
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
  PERFORM 1 FROM public.companion_conversations WHERE id = conv_id AND user_id = p_actor FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.companion_fail_turn_v1(
  p_actor uuid, p_turn uuid, p_generation uuid, p_reason text,
  p_model text DEFAULT NULL, p_response_id text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE conv_id uuid; changed integer;
BEGIN
  SELECT conversation_id INTO conv_id FROM public.companion_chat_turns WHERE id = p_turn;
  PERFORM 1 FROM public.companion_conversations WHERE id = conv_id AND user_id = p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('provider_unavailable', 'content_rejected', 'interrupted') THEN
    RAISE EXCEPTION 'INVALID_FAILURE_REASON' USING ERRCODE = 'PT400';
  END IF;
  UPDATE public.companion_chat_turns SET state = CASE WHEN p_reason = 'content_rejected' THEN 'rejected' ELSE 'failed' END,
    failure_reason = p_reason, model = p_model, provider_response_id = p_response_id,
    input_tokens = p_input_tokens, output_tokens = p_output_tokens
    WHERE id = p_turn AND generation_id = p_generation AND state = 'pending';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    UPDATE public.companion_ai_attempts SET state = CASE WHEN p_reason = 'content_rejected' THEN 'rejected' ELSE 'failed' END,
      model = p_model, provider_response_id = p_response_id, input_tokens = p_input_tokens,
      output_tokens = p_output_tokens, finished_at = clock_timestamp()
      WHERE id = p_generation AND turn_id = p_turn AND state = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTEMPT_STATE_INVALID' USING ERRCODE = 'PT409'; END IF;
  END IF;
  IF changed = 0 AND p_model IS NOT NULL THEN
    -- Meter a late, interrupted attempt without changing the new worker's state.
    UPDATE public.companion_ai_attempts SET model = p_model, provider_response_id = p_response_id,
      input_tokens = p_input_tokens, output_tokens = p_output_tokens
      WHERE id = p_generation AND turn_id = p_turn AND state = 'interrupted';
  END IF;
  RETURN changed = 1;
END $$;
REVOKE ALL ON FUNCTION public.companion_open_conversation_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.companion_begin_turn_v1(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.companion_complete_turn_v1(uuid, uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.companion_fail_turn_v1(uuid, uuid, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.companion_open_conversation_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.companion_begin_turn_v1(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.companion_complete_turn_v1(uuid, uuid, uuid, text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.companion_fail_turn_v1(uuid, uuid, uuid, text, text, text, integer, integer) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version, checksum)
VALUES ('20261101000200', 'f9e63127e42e2572cd48cc713d45a72274b9f582ef34e3a462ee31918be1763a') ON CONFLICT (version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
