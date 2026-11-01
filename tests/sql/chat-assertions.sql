BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid(); character_id uuid := gen_random_uuid();
  conversation uuid; other_conversation uuid; key1 uuid := gen_random_uuid(); key2 uuid := gen_random_uuid();
  claim jsonb; retry_claim jsonb; second_claim jsonb; completed jsonb;
BEGIN
  INSERT INTO public.companion_characters(id, name, archetype, bio, published) VALUES (character_id, 'Chat SQL Fixture', 'Test', 'Fixture', true);
  conversation := public.companion_open_conversation_v1(actor, character_id);
  IF public.companion_open_conversation_v1(actor, character_id) <> conversation THEN RAISE EXCEPTION 'Conversation not idempotent'; END IF;
  other_conversation := public.companion_open_conversation_v1(other_actor, character_id);
  IF other_conversation = conversation THEN RAISE EXCEPTION 'Users share a conversation'; END IF;
  BEGIN
    PERFORM public.companion_begin_turn_v1(other_actor, conversation, key1, 'Hello');
    RAISE EXCEPTION 'Owner check missing' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  claim := public.companion_begin_turn_v1(actor, conversation, key1, 'Hello');
  BEGIN
    PERFORM public.companion_begin_turn_v1(actor, conversation, key1, 'Different');
    RAISE EXCEPTION 'Idempotency payload check missing' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.companion_begin_turn_v1(actor, conversation, key2, 'Another');
    RAISE EXCEPTION 'Parallel generation guard missing' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.companion_fail_turn_v1(actor, (claim->>'turnId')::uuid, (claim->>'generationId')::uuid, 'provider_unavailable');
  retry_claim := public.companion_begin_turn_v1(actor, conversation, key1, 'Hello');
  IF retry_claim->>'turnId' <> claim->>'turnId' OR retry_claim->>'generationId' = claim->>'generationId' THEN RAISE EXCEPTION 'Retry lease invalid'; END IF;
  IF (SELECT count(*) FROM public.companion_messages WHERE conversation_id=conversation) <> 1 THEN RAISE EXCEPTION 'Retry duplicated user message'; END IF;
  BEGIN
    PERFORM public.companion_complete_turn_v1(actor, (claim->>'turnId')::uuid, (claim->>'generationId')::uuid, 'Old', 'test', 'test', 1, 1);
    RAISE EXCEPTION 'Stale worker accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.companion_complete_turn_v1(actor, (retry_claim->>'turnId')::uuid, (retry_claim->>'generationId')::uuid, 'Reply', 'test', 'test', -1, 1);
    RAISE EXCEPTION 'Negative token count accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.companion_messages WHERE conversation_id=conversation) <> 1 THEN RAISE EXCEPTION 'Invalid completion not rolled back'; END IF;
  PERFORM public.companion_complete_turn_v1(actor, (retry_claim->>'turnId')::uuid, (retry_claim->>'generationId')::uuid, 'Reply', 'test', 'test', 10, 2);
  IF (SELECT count(*) FROM public.companion_ai_attempts WHERE turn_id=(claim->>'turnId')::uuid) <> 2 THEN RAISE EXCEPTION 'Attempt history was overwritten'; END IF;
  IF (SELECT state FROM public.companion_ai_attempts WHERE id=(claim->>'generationId')::uuid) <> 'failed' THEN RAISE EXCEPTION 'Failed attempt missing'; END IF;
  IF (SELECT input_tokens FROM public.companion_ai_attempts WHERE id=(retry_claim->>'generationId')::uuid) <> 10 THEN RAISE EXCEPTION 'Completion metering missing'; END IF;
  completed := public.companion_begin_turn_v1(actor, conversation, key1, 'Hello');
  IF completed->>'state' <> 'completed' OR (SELECT count(*) FROM public.companion_messages WHERE conversation_id=conversation) <> 2 THEN RAISE EXCEPTION 'Completed replay not stable'; END IF;
  IF public.companion_fail_turn_v1(actor, (claim->>'turnId')::uuid, (retry_claim->>'generationId')::uuid, 'provider_unavailable') THEN RAISE EXCEPTION 'Completed turn overwritten'; END IF;
  second_claim := public.companion_begin_turn_v1(actor, conversation, key2, 'Next');
  UPDATE public.companion_chat_turns SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(second_claim->>'turnId')::uuid;
  retry_claim := public.companion_begin_turn_v1(actor, conversation, key2, 'Next');
  IF retry_claim->>'generationId' = second_claim->>'generationId' THEN RAISE EXCEPTION 'Expired lease not replaced'; END IF;
  IF public.companion_fail_turn_v1(actor, (second_claim->>'turnId')::uuid, (second_claim->>'generationId')::uuid, 'provider_unavailable') THEN RAISE EXCEPTION 'Stale failure overwrote new generation'; END IF;
  PERFORM public.companion_fail_turn_v1(actor, (second_claim->>'turnId')::uuid, (second_claim->>'generationId')::uuid, 'provider_unavailable', 'late-test-model', 'late-response', 11, 2);
  IF (SELECT input_tokens FROM public.companion_ai_attempts WHERE id=(second_claim->>'generationId')::uuid) <> 11 THEN RAISE EXCEPTION 'Late attempt cost lost'; END IF;
  IF (SELECT generation_id FROM public.companion_chat_turns WHERE id=(retry_claim->>'turnId')::uuid) <> (retry_claim->>'generationId')::uuid THEN RAISE EXCEPTION 'Late metering changed active worker'; END IF;
  BEGIN
    INSERT INTO public.companion_messages(conversation_id,turn_id,role,content,sequence)
      VALUES(other_conversation,(retry_claim->>'turnId')::uuid,'assistant','Mismatch',1);
    RAISE EXCEPTION 'Cross-conversation message relation accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  PERFORM public.companion_fail_turn_v1(actor, (retry_claim->>'turnId')::uuid, (retry_claim->>'generationId')::uuid, 'content_rejected');
  completed := public.companion_begin_turn_v1(actor,conversation,key2,'Next');
  IF completed->>'state' <> 'rejected' THEN RAISE EXCEPTION 'Rejected text regenerates'; END IF;
  IF has_function_privilege('authenticated','public.companion_begin_turn_v1(uuid,uuid,uuid,text)','EXECUTE')
    OR has_table_privilege('anon','public.companion_messages','SELECT') THEN RAISE EXCEPTION 'Client can bypass API'; END IF;
  UPDATE public.companion_characters SET published=false WHERE id=character_id;
  BEGIN
    PERFORM public.companion_open_conversation_v1(actor,character_id);
    RAISE EXCEPTION 'Unpublished character allowed' USING ERRCODE='XX000';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
