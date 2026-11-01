-- Run only in the ai-companion DEVELOPMENT Supabase project's SQL Editor.
-- Isolated SDK experiment: does not modify User, auth, storage, or wallet tables.
BEGIN;

CREATE TABLE IF NOT EXISTS public.companion_sdk_probe_runs (
  id uuid PRIMARY KEY,
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0)
);
ALTER TABLE public.companion_sdk_probe_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.companion_sdk_probe_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.companion_sdk_probe_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.companion_sdk_probe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.companion_sdk_probe_runs(id) ON DELETE CASCADE,
  delta integer NOT NULL
);
CREATE INDEX IF NOT EXISTS companion_sdk_probe_events_run_id_idx
  ON public.companion_sdk_probe_events(run_id);
ALTER TABLE public.companion_sdk_probe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.companion_sdk_probe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.companion_sdk_probe_events TO service_role;

CREATE OR REPLACE FUNCTION public.companion_sdk_probe_adjust_v1(
  p_id uuid,
  p_delta integer,
  p_fail boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  next_value integer;
BEGIN
  UPDATE public.companion_sdk_probe_runs
  SET value = value + p_delta
  WHERE id = p_id
  RETURNING value INTO next_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SDK_PROBE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.companion_sdk_probe_events(run_id, delta)
  VALUES (p_id, p_delta);
  IF p_fail THEN
    RAISE EXCEPTION 'SDK_PROBE_EXPECTED_ROLLBACK' USING ERRCODE = 'P0001';
  END IF;
  RETURN next_value;
END;
$$;
REVOKE ALL ON FUNCTION public.companion_sdk_probe_adjust_v1(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.companion_sdk_probe_adjust_v1(uuid, integer, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
