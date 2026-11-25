BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); visitor uuid:=gen_random_uuid(); other_visitor uuid:=gen_random_uuid();
  character uuid:=gen_random_uuid(); conversation uuid; version integer; snapshot jsonb;
BEGIN
 SELECT revision INTO version FROM public.companion_global_level_config WHERE singleton;
 PERFORM public.companion_admin_save_global_levels_v1(actor,'admin',
   '[{"level":1,"requiredCount":0},{"level":2,"requiredCount":5},{"level":3,"requiredCount":17}]',version);
 INSERT INTO public.companion_users(id) VALUES(visitor),(other_visitor);
 INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Progress ring fixture','Test','Temporary',true);
 conversation:=public.companion_open_conversation_v1(visitor,character);
 snapshot:=public.companion_progress_snapshot_v1(visitor,conversation);
 IF snapshot->>'currentLevelRequiredCount'<>'0' OR snapshot->'nextLevel'->>'requiredCount'<>'5' THEN RAISE EXCEPTION 'INITIAL_PROGRESS_INTERVAL_INCORRECT'; END IF;
 UPDATE public.companion_user_character_progress SET effective_chat_count=9 WHERE user_id=visitor AND character_id=character;
 PERFORM public.companion_sync_progress_v1(visitor,conversation);
 snapshot:=public.companion_progress_snapshot_v1(visitor,conversation);
 IF snapshot->>'level'<>'2' OR snapshot->>'effectiveChatCount'<>'9' OR snapshot->>'currentLevelRequiredCount'<>'5' OR snapshot->'nextLevel'->>'requiredCount'<>'17' THEN RAISE EXCEPTION 'NONUNIFORM_PROGRESS_INTERVAL_INCORRECT'; END IF;
 UPDATE public.companion_user_character_progress SET effective_chat_count=17 WHERE user_id=visitor AND character_id=character;
 PERFORM public.companion_sync_progress_v1(visitor,conversation);
 snapshot:=public.companion_progress_snapshot_v1(visitor,conversation);
 IF snapshot->>'level'<>'3' OR snapshot->>'currentLevelRequiredCount'<>'17' OR snapshot->'nextLevel'<>'null'::jsonb THEN RAISE EXCEPTION 'MAXIMUM_PROGRESS_INTERVAL_INCORRECT'; END IF;
 BEGIN
  PERFORM public.companion_progress_snapshot_v1(other_visitor,conversation);
  RAISE EXCEPTION 'OTHER_USER_PROGRESS_EXPOSED' USING ERRCODE='XX000';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 IF has_function_privilege('authenticated','public.companion_progress_snapshot_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'PROGRESS_SNAPSHOT_PRIVILEGE_LEAK'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
