BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); character uuid:=gen_random_uuid(); other_character uuid:=gen_random_uuid();
  conv uuid; other_conv uuid; own_other_conv uuid; claim jsonb; next_claim jsonb; failed_claim jsonb; turn jsonb; context jsonb; first_turn uuid; seq integer; usage_id uuid;
BEGIN
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Memory Fixture','Test','Fixture',true),(other_character,'Other Memory Fixture','Test','Fixture',true);
  conv:=public.companion_open_conversation_v1(actor,character);
  other_conv:=public.companion_open_conversation_v1(other_actor,character);
  own_other_conv:=public.companion_open_conversation_v1(actor,other_character);
  IF public.companion_claim_memory_v1(actor,conv,2,24000) IS NOT NULL THEN RAISE EXCEPTION 'Empty conversation triggered summary'; END IF;
  turn:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'My name is Alex and I like jazz.');first_turn:=(turn->>'turnId')::uuid;
  PERFORM public.companion_complete_turn_v1(actor,first_turn,(turn->>'generationId')::uuid,'Noted.','test','test',1,1);
  IF public.companion_claim_memory_v1(actor,conv,2,24000) IS NOT NULL THEN RAISE EXCEPTION 'Summary triggered before batch'; END IF;
  turn:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'It is sunny today.');
  PERFORM public.companion_complete_turn_v1(actor,(turn->>'turnId')::uuid,(turn->>'generationId')::uuid,'A lovely day.','test','test',1,1);
  claim:=public.companion_claim_memory_v1(actor,conv,2,24000);
  IF claim IS NULL OR jsonb_array_length(claim->'messages')<>4 THEN RAISE EXCEPTION 'Full successful pairs missing'; END IF;
  IF public.companion_claim_memory_v1(actor,conv,2,24000) IS NOT NULL THEN RAISE EXCEPTION 'Live memory lease duplicated'; END IF;
  usage_id:=public.companion_record_memory_usage_v1(actor,conv,(claim->>'generationId')::uuid,'generation','deepseek','test','response',10,2);
  IF public.companion_record_memory_usage_v1(actor,conv,(claim->>'generationId')::uuid,'generation','deepseek','test','response',10,2)<>usage_id THEN RAISE EXCEPTION 'Usage retry duplicated'; END IF;
  BEGIN
    PERFORM public.companion_record_memory_usage_v1(actor,conv,(claim->>'generationId')::uuid,'generation','deepseek','test','response',99,2);
    RAISE EXCEPTION 'Changed usage accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF NOT public.companion_finish_memory_v1(actor,conv,(claim->>'generationId')::uuid,'User is Alex and enjoys jazz.') THEN RAISE EXCEPTION 'Fresh summary not saved'; END IF;
  context:=public.companion_memory_context_v1(actor,conv,1,24000);
  IF context->>'summary'<>'User is Alex and enjoys jazz.' OR jsonb_array_length(context->'messages')<>2
    OR context->'messages'->0->>'content'<>'It is sunny today.' THEN RAISE EXCEPTION 'Summary/recent split invalid'; END IF;
  IF (public.companion_memory_context_v1(other_actor,other_conv,10,24000))->>'summary'<>''
    OR (public.companion_memory_context_v1(actor,own_other_conv,10,24000))->>'summary'<>'' THEN RAISE EXCEPTION 'Memory shared across user or character'; END IF;
  BEGIN
    PERFORM public.companion_memory_context_v1(other_actor,conv,10,24000);
    RAISE EXCEPTION 'Memory owner bypass' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  FOR seq IN 1..2 LOOP
    turn:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'New topic.');
    PERFORM public.companion_complete_turn_v1(actor,(turn->>'turnId')::uuid,(turn->>'generationId')::uuid,'New reply.','test','test',1,1);
  END LOOP;
  failed_claim:=public.companion_claim_memory_v1(actor,conv,2,24000);
  IF public.companion_finish_memory_v1(actor,conv,(claim->>'generationId')::uuid,'Old worker overwrite') THEN RAISE EXCEPTION 'Old worker accepted'; END IF;
  PERFORM public.companion_finish_memory_v1(actor,conv,(failed_claim->>'generationId')::uuid,NULL);
  IF public.companion_claim_memory_v1(actor,conv,2,24000) IS NOT NULL THEN RAISE EXCEPTION 'Failure cooldown ignored'; END IF;
  IF (public.companion_memory_context_v1(actor,conv,1,24000))->>'summary'<>'User is Alex and enjoys jazz.' THEN RAISE EXCEPTION 'Failure erased old memory'; END IF;
  UPDATE public.companion_chat_memory SET lease_until=clock_timestamp()-interval '1 second' WHERE conversation_id=conv;
  next_claim:=public.companion_claim_memory_v1(actor,conv,2,24000);
  IF public.companion_finish_memory_v1(actor,conv,(failed_claim->>'generationId')::uuid,'Failed worker overwrite') THEN RAISE EXCEPTION 'Failed worker replaced new lease'; END IF;
  -- Message deletion invalidates both saved notes and an in-flight update, without losing levels.
  DELETE FROM public.companion_messages WHERE turn_id=first_turn AND role='user';
  IF public.companion_finish_memory_v1(actor,conv,(next_claim->>'generationId')::uuid,'Restore deleted Alex fact') THEN RAISE EXCEPTION 'Deleted content restored by worker'; END IF;
  context:=public.companion_memory_context_v1(actor,conv,20,24000);
  IF context->>'summary'<>'' OR (context->'messages')::text LIKE '%Alex%' THEN RAISE EXCEPTION 'Deleted fact remains in context'; END IF;
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'effectiveChatCount'<>'4' THEN RAISE EXCEPTION 'Memory deletion changed progress'; END IF;
  turn:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Rejected memory text');
  PERFORM public.companion_fail_turn_v1(actor,(turn->>'turnId')::uuid,(turn->>'generationId')::uuid,'content_rejected');
  IF ((public.companion_memory_context_v1(actor,conv,20,24000))->'messages')::text LIKE '%Rejected memory text%' THEN RAISE EXCEPTION 'Rejected turn entered memory'; END IF;
  FOR seq IN 1..2 LOOP
    turn:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),repeat('u',4000));
    PERFORM public.companion_complete_turn_v1(actor,(turn->>'turnId')::uuid,(turn->>'generationId')::uuid,repeat('a',12000),'test','test',1,1);
  END LOOP;
  claim:=public.companion_claim_memory_v1(actor,conv,20,24000);
  IF claim IS NULL OR (SELECT sum(length(item->>'content')) FROM jsonb_array_elements(claim->'messages') item)>24000
    OR mod(jsonb_array_length(claim->'messages'),2)<>0 THEN RAISE EXCEPTION 'Long-message batch not bounded to whole pairs'; END IF;
  context:=public.companion_memory_context_v1(actor,conv,20,16000);
  IF jsonb_array_length(context->'messages')<>2 THEN RAISE EXCEPTION 'Recent context exceeded character budget'; END IF;
  IF has_table_privilege('anon','public.companion_chat_memory','SELECT') OR has_table_privilege('authenticated','public.companion_memory_usage','INSERT')
    OR has_function_privilege('authenticated','public.companion_claim_memory_v1(uuid,uuid,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Client can bypass private memory'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
