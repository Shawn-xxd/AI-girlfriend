-- SDK foundation: run only in the development Supabase SQL Editor.
-- Does not modify auth/storage, existing User, or SDK experiment resources.
BEGIN;
SELECT pg_advisory_xact_lock(740831501);
CREATE TABLE IF NOT EXISTS public.companion_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companion_schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.companion_schema_migrations TO service_role;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.companion_schema_migrations
    WHERE version = '20261101000100' AND checksum <> '66369d244339e6d6d3335175c534c38dc90e1eff54f3f527ad9dfce4b45a388c'
  ) THEN
    RAISE EXCEPTION 'Migration checksum mismatch';
  END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE TABLE IF NOT EXISTS public.companion_users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companion_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_users TO service_role;

CREATE TABLE IF NOT EXISTS public.companion_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 64),
  archetype text NOT NULL CHECK (length(btrim(archetype)) BETWEEN 1 AND 64),
  bio text NOT NULL CHECK (length(bio) <= 2000),
  tags text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companion_characters_published_id_idx
  ON public.companion_characters (published, id);
ALTER TABLE public.companion_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_characters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companion_characters TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version, checksum)
VALUES ('20261101000100', '66369d244339e6d6d3335175c534c38dc90e1eff54f3f527ad9dfce4b45a388c')
ON CONFLICT (version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
