-- Optional: after verification, remove only the SDK experiment resources.
BEGIN;
DROP FUNCTION IF EXISTS public.companion_sdk_probe_adjust_v1(uuid, integer, boolean);
DROP TABLE IF EXISTS public.companion_sdk_probe_events;
DROP TABLE IF EXISTS public.companion_sdk_probe_runs;
NOTIFY pgrst, 'reload schema';
COMMIT;
