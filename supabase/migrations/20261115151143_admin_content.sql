BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261111000100') THEN RAISE EXCEPTION 'Wallet migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261115151143' AND checksum<>'41e2f2628eb5dd84e7473cdbc359f0bd4c3e2735f2d5f322d047e145fc8fab93') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
ALTER TABLE public.companion_characters ADD COLUMN IF NOT EXISTS cover_object_key text;
ALTER TABLE public.companion_characters ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE public.companion_photos ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE public.companion_level_configs ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
CREATE TABLE IF NOT EXISTS public.companion_admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,
 actor_role text NOT NULL CHECK(actor_role IN ('editor','admin')),
 action text NOT NULL CHECK(action IN ('character.save','photo.save','levels.save')),
 target_id uuid NOT NULL,
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS companion_admin_audit_actor_idx ON public.companion_admin_audit(actor_id,id DESC);
ALTER TABLE public.companion_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_admin_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.companion_admin_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.companion_admin_audit_id_seq TO service_role;
CREATE OR REPLACE FUNCTION public.companion_admin_audit_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'AUDIT_IS_APPEND_ONLY' USING ERRCODE='PT400'; END $$;
DROP TRIGGER IF EXISTS companion_admin_audit_immutable ON public.companion_admin_audit;
CREATE TRIGGER companion_admin_audit_immutable BEFORE UPDATE OR DELETE ON public.companion_admin_audit FOR EACH ROW EXECUTE FUNCTION public.companion_admin_audit_immutable_v1();
CREATE OR REPLACE FUNCTION public.companion_content_revision_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN NEW.revision:=OLD.revision+1; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS companion_character_revision ON public.companion_characters;
CREATE TRIGGER companion_character_revision BEFORE UPDATE ON public.companion_characters FOR EACH ROW EXECUTE FUNCTION public.companion_content_revision_v1();
DROP TRIGGER IF EXISTS companion_photo_revision ON public.companion_photos;
CREATE TRIGGER companion_photo_revision BEFORE UPDATE ON public.companion_photos FOR EACH ROW EXECUTE FUNCTION public.companion_content_revision_v1();
DROP TRIGGER IF EXISTS companion_levels_revision ON public.companion_level_configs;
CREATE TRIGGER companion_levels_revision BEFORE UPDATE ON public.companion_level_configs FOR EACH ROW EXECUTE FUNCTION public.companion_content_revision_v1();
CREATE OR REPLACE FUNCTION public.companion_admin_write_v1(p_actor uuid,p_role text,p_action text,p_target uuid,p_payload jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous jsonb; result jsonb; current_revision integer; character uuid;
BEGIN
 IF p_actor IS NULL OR p_target IS NULL OR p_role NOT IN ('editor','admin') OR p_role IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('character.save','photo.save','levels.save') OR p_action IS NULL THEN RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='PT400'; END IF;
 IF p_role<>'admin' AND (p_action='levels.save' OR coalesce((p_payload->>'published')::boolean,false) OR p_payload->>'review_status'='approved') THEN RAISE EXCEPTION 'PUBLISHER_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Serialize content changes against chat progression using the existing character lock order.
 IF p_action='character.save' THEN
  SELECT to_jsonb(c),c.revision INTO previous,current_revision FROM public.companion_characters c WHERE id=p_target FOR UPDATE;
 ELSE
  IF p_action='photo.save' THEN character:=(p_payload->>'character_id')::uuid;
  ELSE character:=p_target; END IF;
  PERFORM 1 FROM public.companion_characters WHERE id=character FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_action='photo.save' THEN
   SELECT to_jsonb(p),p.revision INTO previous,current_revision FROM public.companion_photos p WHERE id=p_target FOR UPDATE;
  ELSE
   SELECT to_jsonb(l),l.revision INTO previous,current_revision FROM public.companion_level_configs l WHERE character_id=p_target FOR UPDATE;
  END IF;
 END IF;
 IF (previous IS NULL AND p_revision IS NOT NULL) OR (previous IS NOT NULL AND (p_revision IS NULL OR current_revision<>p_revision)) THEN RAISE EXCEPTION 'CONTENT_CHANGED' USING ERRCODE='PT409'; END IF;
 IF p_action='character.save' THEN
  IF coalesce((p_payload->>'published')::boolean,false) AND length(btrim(coalesce(p_payload->>'system_prompt','')))=0 THEN RAISE EXCEPTION 'PROMPT_REQUIRED' USING ERRCODE='PT400'; END IF;
  IF previous IS NULL THEN
   INSERT INTO public.companion_characters(id,name,archetype,bio,tags,system_prompt,published,cover_object_key)
   VALUES(p_target,p_payload->>'name',p_payload->>'archetype',p_payload->>'bio',ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),p_payload->>'system_prompt',(p_payload->>'published')::boolean,p_payload->>'cover_object_key');
  ELSE
   UPDATE public.companion_characters SET name=p_payload->>'name',archetype=p_payload->>'archetype',bio=p_payload->>'bio',tags=ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),system_prompt=p_payload->>'system_prompt',published=(p_payload->>'published')::boolean,cover_object_key=p_payload->>'cover_object_key' WHERE id=p_target;
  END IF;
  SELECT to_jsonb(c) INTO result FROM public.companion_characters c WHERE id=p_target;
 ELSIF p_action='photo.save' THEN
  IF previous IS NOT NULL AND previous->>'character_id'<>p_payload->>'character_id' THEN RAISE EXCEPTION 'PHOTO_CHARACTER_IMMUTABLE' USING ERRCODE='PT400'; END IF;
  IF previous IS NULL THEN
   INSERT INTO public.companion_photos(id,character_id,title,kind,required_level,diamond_price,object_key,review_status,published)
   VALUES(p_target,character,p_payload->>'title',p_payload->>'kind',(p_payload->>'required_level')::integer,(p_payload->>'diamond_price')::integer,p_payload->>'object_key',p_payload->>'review_status',(p_payload->>'published')::boolean);
  ELSE
   UPDATE public.companion_photos SET title=p_payload->>'title',kind=p_payload->>'kind',required_level=(p_payload->>'required_level')::integer,diamond_price=(p_payload->>'diamond_price')::integer,object_key=p_payload->>'object_key',review_status=p_payload->>'review_status',published=(p_payload->>'published')::boolean WHERE id=p_target;
  END IF;
  SELECT to_jsonb(p) INTO result FROM public.companion_photos p WHERE id=p_target;
 ELSE
  PERFORM public.companion_set_level_rules_v1(p_target,p_payload->'rules');
  SELECT to_jsonb(l) INTO result FROM public.companion_level_configs l WHERE character_id=p_target;
 END IF;
 INSERT INTO public.companion_admin_audit(actor_id,actor_role,action,target_id,before_data,after_data) VALUES(p_actor,p_role,p_action,p_target,previous,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.companion_admin_write_v1(uuid,text,text,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_admin_write_v1(uuid,text,text,uuid,jsonb,integer) TO service_role;
REVOKE ALL ON FUNCTION public.companion_content_revision_v1(),public.companion_admin_audit_immutable_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_content_revision_v1(),public.companion_admin_audit_immutable_v1() TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum)
VALUES ('20261115151143', '41e2f2628eb5dd84e7473cdbc359f0bd4c3e2735f2d5f322d047e145fc8fab93') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
