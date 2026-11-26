BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261125032534') THEN RAISE EXCEPTION 'Level progress migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261126130522' AND checksum<>'3df2605c4af0c3d4df2bfceb74e75c8b03ba19ee71646853782324b6525a534a') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
ALTER TABLE public.companion_characters ADD COLUMN IF NOT EXISTS first_message text NOT NULL DEFAULT '' CHECK(length(first_message)<=4000);
ALTER TABLE public.companion_conversations ADD COLUMN IF NOT EXISTS greeting_message text NOT NULL DEFAULT '' CHECK(length(greeting_message)<=4000);

-- A conversation owns its original greeting. Existing chats are not backfilled.
CREATE OR REPLACE FUNCTION public.companion_snapshot_greeting_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 SELECT btrim(first_message) INTO NEW.greeting_message FROM public.companion_characters WHERE id=NEW.character_id AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHARACTER_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.companion_snapshot_greeting_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_snapshot_greeting_v1() TO service_role;
CREATE OR REPLACE TRIGGER companion_snapshot_greeting BEFORE INSERT ON public.companion_conversations FOR EACH ROW EXECUTE FUNCTION public.companion_snapshot_greeting_v1();

CREATE OR REPLACE FUNCTION public.companion_admin_write_v1(p_actor uuid,p_role text,p_action text,p_target uuid,p_payload jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous jsonb; result jsonb; current_revision integer; character uuid;
BEGIN
 IF p_action='levels.save' THEN RAISE EXCEPTION 'USE_GLOBAL_LEVEL_RULES' USING ERRCODE='PT400'; END IF;
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
   INSERT INTO public.companion_characters(id,name,archetype,bio,tags,system_prompt,first_message,published,cover_object_key,avatar_focus_y)
   VALUES(p_target,p_payload->>'name',p_payload->>'archetype',p_payload->>'bio',ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),p_payload->>'system_prompt',coalesce(p_payload->>'first_message',''),(p_payload->>'published')::boolean,p_payload->>'cover_object_key',coalesce((p_payload->>'avatar_focus_y')::double precision,0.2));
  ELSE
   UPDATE public.companion_characters SET name=p_payload->>'name',archetype=p_payload->>'archetype',bio=p_payload->>'bio',tags=ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),system_prompt=p_payload->>'system_prompt',first_message=CASE WHEN p_payload ? 'first_message' THEN coalesce(p_payload->>'first_message','') ELSE first_message END,published=(p_payload->>'published')::boolean,cover_object_key=p_payload->>'cover_object_key',avatar_focus_y=coalesce((p_payload->>'avatar_focus_y')::double precision,avatar_focus_y) WHERE id=p_target;
  END IF;
  SELECT to_jsonb(c) INTO result FROM public.companion_characters c WHERE id=p_target;
 ELSIF p_action='photo.save' THEN
  IF previous IS NOT NULL AND previous->>'object_key' IS DISTINCT FROM p_payload->>'object_key' AND p_role<>'admin' THEN RAISE EXCEPTION 'PHOTO_REPLACEMENT_REQUIRES_ADMIN' USING ERRCODE='42501'; END IF;
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
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum) VALUES ('20261126130522', '3df2605c4af0c3d4df2bfceb74e75c8b03ba19ee71646853782324b6525a534a') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
