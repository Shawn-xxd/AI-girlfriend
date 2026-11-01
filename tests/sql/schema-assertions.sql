BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  user_id uuid := gen_random_uuid();
  character_id uuid := gen_random_uuid();
  original_created_at timestamptz;
BEGIN
  INSERT INTO public.companion_users(id) VALUES (user_id);
  SELECT created_at INTO original_created_at FROM public.companion_users WHERE id = user_id;
  INSERT INTO public.companion_users(id) VALUES (user_id) ON CONFLICT(id) DO NOTHING;
  IF (SELECT count(*) FROM public.companion_users WHERE id = user_id) <> 1 THEN
    RAISE EXCEPTION 'User mapping not idempotent';
  END IF;
  IF (SELECT created_at FROM public.companion_users WHERE id = user_id) <> original_created_at THEN
    RAISE EXCEPTION 'User creation time changed';
  END IF;
  INSERT INTO public.companion_characters(id, name, archetype, bio)
    VALUES (character_id, 'Schema Test', 'Test', 'Temporary fixture');
  IF (SELECT published FROM public.companion_characters WHERE id = character_id) THEN
    RAISE EXCEPTION 'Characters must default to unpublished';
  END IF;
  BEGIN
    INSERT INTO public.companion_characters(name, archetype, bio) VALUES (' ', 'Test', 'Invalid fixture');
    RAISE EXCEPTION 'Invalid name accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF has_table_privilege('anon', 'public.companion_users', 'SELECT')
     OR has_table_privilege('authenticated', 'public.companion_users', 'INSERT')
     OR has_table_privilege('anon', 'public.companion_characters', 'SELECT')
     OR has_table_privilege('service_role', 'public.companion_schema_migrations', 'INSERT') THEN
    RAISE EXCEPTION 'Unexpected role privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('companion_users', 'companion_characters', 'companion_schema_migrations')
      AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Business table missing RLS'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
