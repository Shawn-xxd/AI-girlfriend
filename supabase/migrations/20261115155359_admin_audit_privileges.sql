BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261115151143') THEN RAISE EXCEPTION 'Admin content migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261115155359' AND checksum<>'70c966522586e9f1cab358aa0e49196479e003c49e9ef85976ae9575baf867ce') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
REVOKE ALL ON public.companion_admin_audit FROM service_role;
GRANT SELECT,INSERT ON public.companion_admin_audit TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum)
VALUES ('20261115155359', '70c966522586e9f1cab358aa0e49196479e003c49e9ef85976ae9575baf867ce') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
