BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid(); character_id uuid := gen_random_uuid(); conversation uuid; claim jsonb; first_id uuid; repeated_id uuid;
BEGIN
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character_id,'Usage Fixture','Test','Fixture',true);
  conversation := public.companion_open_conversation_v1(actor,character_id);
  claim := public.companion_begin_turn_v1(actor,conversation,gen_random_uuid(),'Usage test');
  first_id := public.companion_record_ai_usage_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'input_moderation','deepseek','classifier','mod-fixture',5,1);
  repeated_id := public.companion_record_ai_usage_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'input_moderation','deepseek','classifier','mod-fixture',5,1);
  IF first_id <> repeated_id THEN RAISE EXCEPTION 'Usage write not idempotent'; END IF;
  PERFORM public.companion_record_ai_usage_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'generation','openai-compatible','another-model','reply-fixture',10,2);
  PERFORM public.companion_record_ai_usage_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'output_moderation','openai','dedicated-moderation','mod-fixture-2',NULL,NULL);
  IF (SELECT count(*) FROM public.companion_ai_usage_events WHERE generation_id=(claim->>'generationId')::uuid) <> 3 THEN RAISE EXCEPTION 'Mixed-provider usage lost'; END IF;
  BEGIN
    PERFORM public.companion_record_ai_usage_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'generation','openai-compatible','another-model','different-response',20,4);
    RAISE EXCEPTION 'Conflicting usage overwrites original' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.companion_record_ai_usage_v1(other_actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'generation','deepseek','another-model','reply-fixture',10,2);
    RAISE EXCEPTION 'Other user can write usage' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  IF has_table_privilege('service_role','public.companion_ai_usage_events','UPDATE')
    OR has_function_privilege('authenticated','public.companion_record_ai_usage_v1(uuid,uuid,uuid,text,text,text,text,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected usage privilege'; END IF;
  DELETE FROM public.companion_users WHERE id=actor;
  IF EXISTS (SELECT 1 FROM public.companion_ai_usage_events WHERE generation_id=(claim->>'generationId')::uuid) THEN RAISE EXCEPTION 'Usage cleanup failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
