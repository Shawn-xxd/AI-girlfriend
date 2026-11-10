BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); character uuid:=gen_random_uuid();
  conv uuid; other_conv uuid; first_key uuid:=gen_random_uuid(); claim jsonb; retry_claim jsonb; denied jsonb;
  p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); snapshot jsonb; timeline jsonb;
  other_character uuid:=gen_random_uuid(); own_other_conv uuid;
BEGIN
  IF (SELECT effective_chat_count FROM public.companion_user_character_progress WHERE user_id='71000000-0000-4000-8000-000000000001')<>1
    OR (SELECT count(*) FROM public.companion_chat_count_events WHERE user_id='71000000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'Historical completion backfill missing or duplicated on migration replay'; END IF;
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Level SQL Fixture','Test','Fixture',true);
  PERFORM public.companion_set_level_rules_v1(character,'[{"level":1,"requiredCount":0},{"level":2,"requiredCount":2},{"level":3,"requiredCount":4}]');
  BEGIN
    PERFORM public.companion_set_level_rules_v1(character,'[{"level":1,"requiredCount":0},{"level":2,"requiredCount":0}]');
    RAISE EXCEPTION 'Non-increasing thresholds accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM public.companion_set_level_rules_v1(character,'[{"level":1,"requiredCount":0},{"level":3,"requiredCount":2}]');
    RAISE EXCEPTION 'Non-contiguous levels accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  INSERT INTO public.companion_photos(id,character_id,title,required_level,object_key,review_status,published) VALUES
    (p1,character,'Level 1',1,character||'/level1.png','approved',true),
    (p2,character,'Level 2',2,character||'/level2.png','approved',true),
    (p3,character,'Level 3',3,character||'/level3.png','approved',true);
  conv:=public.companion_open_conversation_v1(actor,character);
  PERFORM public.companion_open_conversation_v1(actor,character);
  snapshot:=public.companion_progress_snapshot_v1(actor,conv);
  IF snapshot->>'level'<>'1' OR snapshot->>'effectiveChatCount'<>'0'
    OR (SELECT count(*) FROM public.companion_photo_messages WHERE conversation_id=conv)<>1 THEN
    RAISE EXCEPTION 'Initial level photo not exactly once'; END IF;
  other_conv:=public.companion_open_conversation_v1(other_actor,character);
  BEGIN
    INSERT INTO public.companion_photo_messages(conversation_id,unlock_id,sequence)
      SELECT other_conv,id,1000 FROM public.companion_photo_unlocks WHERE user_id=actor AND photo_id=p1;
    RAISE EXCEPTION 'Photo card owner mismatch allowed' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM public.companion_timeline_v1(other_actor,conv,NULL,25);
    RAISE EXCEPTION 'Timeline owner bypass' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  claim:=public.companion_begin_turn_v1(actor,conv,first_key,'First');
  PERFORM public.companion_fail_turn_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'provider_unavailable');
  denied:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Rejected');
  PERFORM public.companion_fail_turn_v1(actor,(denied->>'turnId')::uuid,(denied->>'generationId')::uuid,'content_rejected');
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'effectiveChatCount'<>'0' THEN RAISE EXCEPTION 'Failure or rejection counted'; END IF;
  retry_claim:=public.companion_begin_turn_v1(actor,conv,first_key,'First');
  PERFORM public.companion_complete_turn_v1(actor,(retry_claim->>'turnId')::uuid,(retry_claim->>'generationId')::uuid,'Reply','test','test',1,1);
  PERFORM public.companion_begin_turn_v1(actor,conv,first_key,'First');
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'effectiveChatCount'<>'1' THEN RAISE EXCEPTION 'Retry counted twice'; END IF;
  claim:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Second');
  -- Force a failure after the completion trigger: the whole reply/count/reward must roll back.
  UPDATE public.companion_ai_attempts SET state='failed' WHERE id=(claim->>'generationId')::uuid;
  BEGIN
    PERFORM public.companion_complete_turn_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'Reply','test','test',1,1);
    RAISE EXCEPTION 'Invalid attempt completion accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'effectiveChatCount'<>'1'
    OR (SELECT count(*) FROM public.companion_photo_messages WHERE conversation_id=conv)<>1
    OR EXISTS(SELECT 1 FROM public.companion_messages WHERE turn_id=(claim->>'turnId')::uuid AND role='assistant') THEN
    RAISE EXCEPTION 'Partial reply/count/reward escaped rollback'; END IF;
  UPDATE public.companion_ai_attempts SET state='pending' WHERE id=(claim->>'generationId')::uuid;
  PERFORM public.companion_complete_turn_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'Reply','test','test',1,1);
  UPDATE public.companion_chat_turns SET state='completed' WHERE id=(claim->>'turnId')::uuid;
  snapshot:=public.companion_progress_snapshot_v1(actor,conv);
  IF snapshot->>'effectiveChatCount'<>'2' OR snapshot->>'level'<>'2'
    OR (SELECT count(*) FROM public.companion_photo_messages WHERE conversation_id=conv)<>2 THEN
    RAISE EXCEPTION 'Completion did not atomically count and grant Level 2'; END IF;
  IF (public.companion_progress_snapshot_v1(other_actor,other_conv))->>'effectiveChatCount'<>'0' THEN RAISE EXCEPTION 'Visitor progress shared'; END IF;
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(other_character,'Second Character Fixture','Test','Fixture',true);
  own_other_conv:=public.companion_open_conversation_v1(actor,other_character);
  IF (public.companion_progress_snapshot_v1(actor,own_other_conv))->>'effectiveChatCount'<>'0'
    OR (public.companion_progress_snapshot_v1(actor,own_other_conv))->>'level'<>'1' THEN RAISE EXCEPTION 'Same visitor shares progress between characters'; END IF;
  BEGIN
    INSERT INTO public.companion_photo_messages(conversation_id,unlock_id,sequence)
      SELECT own_other_conv,id,1000 FROM public.companion_photo_unlocks WHERE user_id=actor AND photo_id=p1;
    RAISE EXCEPTION 'Other character received earned photo card' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  timeline:=public.companion_timeline_v1(actor,conv,NULL,2);
  IF jsonb_array_length(timeline->'entries')<>2 OR timeline->>'nextBefore' IS NULL
    OR timeline->'entries'->1->>'kind'<>'photo' THEN RAISE EXCEPTION 'Mixed timeline pagination invalid'; END IF;
  PERFORM public.companion_set_level_rules_v1(character,'[{"level":1,"requiredCount":0},{"level":2,"requiredCount":10},{"level":3,"requiredCount":20}]');
  PERFORM public.companion_sync_progress_v1(actor,conv);
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'level'<>'2' THEN RAISE EXCEPTION 'Threshold increase revoked earned level'; END IF;
  PERFORM public.companion_set_level_rules_v1(character,'[{"level":1,"requiredCount":0},{"level":2,"requiredCount":1},{"level":3,"requiredCount":2}]');
  PERFORM public.companion_sync_progress_v1(actor,conv);
  PERFORM public.companion_sync_progress_v1(actor,conv);
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'level'<>'3'
    OR (SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id=actor)<>3
    OR (SELECT count(*) FROM public.companion_photo_messages WHERE conversation_id=conv)<>3 THEN
    RAISE EXCEPTION 'Threshold decrease missed or duplicated rewards'; END IF;
  UPDATE public.companion_photos SET published=false WHERE id=p1;
  IF jsonb_array_length(public.companion_level_photos_v1(actor,conv)->'photos')<>3 THEN RAISE EXCEPTION 'Unpublishing revoked earned photo'; END IF;
  BEGIN
    UPDATE public.companion_photos SET object_key=character||'/replacement.png' WHERE id=p1;
    RAISE EXCEPTION 'Earned photo identity changed' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  DELETE FROM public.companion_messages WHERE conversation_id=conv;
  DELETE FROM public.companion_chat_turns WHERE conversation_id=conv;
  DELETE FROM public.companion_photo_messages WHERE conversation_id=conv;
  PERFORM public.companion_sync_progress_v1(actor,conv);
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'effectiveChatCount'<>'2'
    OR (SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id=actor)<>3
    OR EXISTS(SELECT 1 FROM public.companion_photo_messages WHERE conversation_id=conv) THEN
    RAISE EXCEPTION 'History deletion lost progress or resent rewards'; END IF;
  DELETE FROM public.companion_conversations WHERE id=conv;
  conv:=public.companion_open_conversation_v1(actor,character);
  IF (public.companion_progress_snapshot_v1(actor,conv))->>'level'<>'3'
    OR (SELECT count(*) FROM public.companion_chat_count_events WHERE user_id=actor)<>2 THEN RAISE EXCEPTION 'Conversation deletion lost progress'; END IF;
  IF has_table_privilege('authenticated','public.companion_photo_unlocks','INSERT')
    OR has_table_privilege('anon','public.companion_photos','SELECT')
    OR has_function_privilege('authenticated','public.companion_set_level_rules_v1(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.companion_sync_progress_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Client can grant rewards'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
