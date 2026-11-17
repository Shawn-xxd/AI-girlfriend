BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261116145624') THEN RAISE EXCEPTION 'Photo replacement migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261117042241' AND checksum<>'e5a71b5d8c1fa75e6ddc1c235574e02f6ada11c9c49b04d93ab0d0dc776027cc') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
-- Keep per-character rows as an archive, but all progression reads one shared config.
CREATE TABLE IF NOT EXISTS public.companion_global_level_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 rules jsonb NOT NULL CHECK(public.companion_valid_level_rules_v1(rules)),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.companion_global_level_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_global_level_config FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.companion_global_level_config TO service_role;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companion_global_level_config WHERE singleton) THEN
  IF (SELECT count(DISTINCT rules) FROM public.companion_level_configs)>1 THEN
   RAISE EXCEPTION 'CONFLICTING_LEGACY_LEVEL_RULES_REQUIRE_EXPLICIT_SELECTION';
  END IF;
  INSERT INTO public.companion_global_level_config(singleton,rules)
   SELECT true,coalesce((SELECT rules FROM public.companion_level_configs LIMIT 1),'[{"level":1,"requiredCount":0}]'::jsonb);
 END IF;
END $$;
DROP TRIGGER IF EXISTS companion_global_level_revision ON public.companion_global_level_config;
CREATE TRIGGER companion_global_level_revision BEFORE UPDATE ON public.companion_global_level_config
 FOR EACH ROW EXECUTE FUNCTION public.companion_content_revision_v1();
CREATE OR REPLACE FUNCTION public.companion_set_level_rules_v1(p_character uuid,p_rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'USE_GLOBAL_LEVEL_RULES' USING ERRCODE='PT400'; END $$;
CREATE OR REPLACE FUNCTION public.companion_admin_save_global_levels_v1(p_actor uuid,p_role text,p_rules jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.companion_global_level_config; result jsonb;
BEGIN
 IF p_actor IS NULL OR p_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_rules IS NULL OR NOT public.companion_valid_level_rules_v1(p_rules) THEN RAISE EXCEPTION 'INVALID_LEVEL_RULES' USING ERRCODE='PT400'; END IF;
 SELECT * INTO previous FROM public.companion_global_level_config WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'GLOBAL_LEVEL_RULES_MISSING' USING ERRCODE='P0002'; END IF;
 IF p_revision IS DISTINCT FROM previous.revision THEN RAISE EXCEPTION 'CONTENT_CHANGED' USING ERRCODE='PT409'; END IF;
 UPDATE public.companion_global_level_config SET rules=p_rules,updated_at=clock_timestamp() WHERE singleton;
 SELECT jsonb_build_object('rules',rules,'revision',revision) INTO result FROM public.companion_global_level_config WHERE singleton;
 INSERT INTO public.companion_admin_audit(actor_id,actor_role,action,target_id,before_data,after_data)
 VALUES(p_actor,p_role,'levels.save','00000000-0000-4000-8000-000000000001',to_jsonb(previous),result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.companion_sync_progress_v1(p_actor uuid,p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress;
  config jsonb; achieved integer; item public.companion_photos; unlock uuid; seq integer;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  -- Keep character and shared global-config locks before the progress row.
  PERFORM 1 FROM public.companion_characters WHERE id=conv.character_id FOR SHARE;
  SELECT rules INTO config FROM public.companion_global_level_config WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GLOBAL_LEVEL_RULES_MISSING' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.companion_user_character_progress(user_id,character_id) VALUES(p_actor,conv.character_id)
    ON CONFLICT(user_id,character_id) DO NOTHING;
  SELECT * INTO progress FROM public.companion_user_character_progress WHERE user_id=p_actor AND character_id=conv.character_id FOR UPDATE;
  SELECT max((r->>'level')::integer) INTO achieved FROM jsonb_array_elements(config) r
    WHERE (r->>'requiredCount')::integer<=progress.effective_chat_count;
  UPDATE public.companion_user_character_progress SET level=greatest(level,achieved),updated_at=clock_timestamp()
    WHERE user_id=p_actor AND character_id=conv.character_id RETURNING * INTO progress;
  FOR item IN SELECT * FROM public.companion_photos WHERE character_id=conv.character_id AND kind='level'
    AND published AND review_status='approved' AND required_level<=progress.level ORDER BY required_level,id FOR SHARE LOOP
    unlock:=NULL;
    INSERT INTO public.companion_photo_unlocks(user_id,character_id,photo_id,earned_level)
      VALUES(p_actor,conv.character_id,item.id,progress.level)
      ON CONFLICT(user_id,photo_id) DO NOTHING RETURNING id INTO unlock;
    IF unlock IS NOT NULL THEN
      UPDATE public.companion_conversations SET next_sequence=next_sequence+1 WHERE id=p_conversation RETURNING next_sequence INTO seq;
      INSERT INTO public.companion_photo_messages(conversation_id,unlock_id,sequence) VALUES(p_conversation,unlock,seq);
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.companion_progress_snapshot_v1(p_actor uuid,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress; upcoming jsonb;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO progress FROM public.companion_user_character_progress WHERE user_id=p_actor AND character_id=conv.character_id;
  SELECT jsonb_build_object('level',(r->>'level')::integer,'requiredCount',(r->>'requiredCount')::integer) INTO upcoming
    FROM public.companion_global_level_config c CROSS JOIN LATERAL jsonb_array_elements(c.rules) r
    WHERE c.singleton AND (r->>'level')::integer>coalesce(progress.level,1)
    ORDER BY (r->>'level')::integer LIMIT 1;
  RETURN jsonb_build_object('level',coalesce(progress.level,1),'effectiveChatCount',coalesce(progress.effective_chat_count,0),'nextLevel',upcoming);
END $$;
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
   INSERT INTO public.companion_characters(id,name,archetype,bio,tags,system_prompt,published,cover_object_key)
   VALUES(p_target,p_payload->>'name',p_payload->>'archetype',p_payload->>'bio',ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),p_payload->>'system_prompt',(p_payload->>'published')::boolean,p_payload->>'cover_object_key');
  ELSE
   UPDATE public.companion_characters SET name=p_payload->>'name',archetype=p_payload->>'archetype',bio=p_payload->>'bio',tags=ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),system_prompt=p_payload->>'system_prompt',published=(p_payload->>'published')::boolean,cover_object_key=p_payload->>'cover_object_key' WHERE id=p_target;
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
REVOKE ALL ON FUNCTION public.companion_admin_save_global_levels_v1(uuid,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_admin_save_global_levels_v1(uuid,text,jsonb,integer) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum) VALUES ('20261117042241', 'e5a71b5d8c1fa75e6ddc1c235574e02f6ada11c9c49b04d93ab0d0dc776027cc') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
