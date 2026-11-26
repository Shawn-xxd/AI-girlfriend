-- Fixtures only; this file is safe to run against the designated development DB.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); character uuid:=gen_random_uuid();
 conv uuid; replacement uuid; reopened uuid; photo uuid:=gen_random_uuid(); level_photo uuid:=gen_random_uuid();
 key uuid:=gen_random_uuid(); claim jsonb; pending jsonb; result jsonb; memory jsonb; wallet jsonb; progress jsonb; unlocks integer;
BEGIN
 INSERT INTO public.companion_characters(id,name,archetype,bio,first_message,published) VALUES(character,'History fixture','Test','Temporary','First greeting',true);
 INSERT INTO public.companion_users(id) VALUES(actor),(other_actor);
 INSERT INTO public.companion_photos(id,character_id,kind,object_key,review_status,published,diamond_price)
 VALUES(photo,character,'diamond','history-fixture/private','approved',true,7);
 INSERT INTO public.companion_photos(id,character_id,kind,object_key,review_status,published,required_level)
 VALUES(level_photo,character,'level','history-fixture/level','approved',true,1);
 conv:=public.companion_open_conversation_v1(actor,character);
 PERFORM public.companion_credit_wallet_v1(actor,14,'history-fixture/'||actor::text);
 PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,photo,gen_random_uuid(),7);
 claim:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Fixture text');
 PERFORM public.companion_complete_turn_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'Fixture reply','test','test',1,1);
 memory:=public.companion_claim_memory_v1(actor,conv,1);
 pending:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Pending text');
 wallet:=public.companion_wallet_snapshot_v1(actor);
 SELECT to_jsonb(p) INTO progress FROM public.companion_user_character_progress p WHERE user_id=actor AND character_id=character;
 SELECT count(*) INTO unlocks FROM public.companion_photo_unlocks WHERE user_id=actor;
 BEGIN PERFORM public.companion_change_history_v1(other_actor,conv,gen_random_uuid(),'clear'); RAISE EXCEPTION 'OTHER_OWNER_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 result:=public.companion_change_history_v1(actor,conv,key,'clear');
 replacement:=(result->>'conversationId')::uuid;
 IF replacement IS NULL OR replacement=conv THEN RAISE EXCEPTION 'MISSING_REPLACEMENT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companion_conversations WHERE id=conv AND archived AND greeting_message='') THEN RAISE EXCEPTION 'OLD_CHAT_STILL_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_messages WHERE conversation_id=conv) OR EXISTS(SELECT 1 FROM public.companion_photo_messages WHERE conversation_id=conv) OR EXISTS(SELECT 1 FROM public.companion_chat_memory WHERE conversation_id=conv) THEN RAISE EXCEPTION 'OLD_HISTORY_RETAINED'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_chat_turns WHERE conversation_id=conv AND state='pending') OR EXISTS(SELECT 1 FROM public.companion_ai_attempts WHERE id=(pending->>'generationId')::uuid AND state='pending') THEN RAISE EXCEPTION 'GENERATION_NOT_CANCELLED'; END IF;
 IF (SELECT greeting_message FROM public.companion_conversations WHERE id=replacement)<>'' THEN RAISE EXCEPTION 'GREETING_REPLAYED'; END IF;
 IF jsonb_array_length(public.companion_timeline_v1(actor,replacement,NULL,40)->'entries')<>0 THEN RAISE EXCEPTION 'NEW_TIMELINE_NOT_EMPTY'; END IF;
 IF public.companion_wallet_snapshot_v1(actor)<>wallet OR (SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id=actor)<>unlocks THEN RAISE EXCEPTION 'EARNED_RIGHTS_CHANGED'; END IF;
 IF (SELECT to_jsonb(p)-'updated_at' FROM public.companion_user_character_progress p WHERE user_id=actor AND character_id=character)<>progress-'updated_at' THEN RAISE EXCEPTION 'PROGRESS_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.companion_chat_count_events WHERE user_id=actor)<>1 THEN RAISE EXCEPTION 'COUNT_RECEIPT_LOST'; END IF;
 BEGIN PERFORM public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Late retry'); RAISE EXCEPTION 'OLD_ID_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 BEGIN PERFORM public.companion_complete_turn_v1(actor,(pending->>'turnId')::uuid,(pending->>'generationId')::uuid,'Late reply','test','test',1,1); RAISE EXCEPTION 'LATE_REPLY_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 BEGIN PERFORM public.companion_memory_context_v1(actor,conv); RAISE EXCEPTION 'OLD_CONTEXT_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 BEGIN PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,photo,gen_random_uuid(),7); RAISE EXCEPTION 'OLD_UNLOCK_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 IF public.companion_finish_memory_v1(actor,conv,(memory->>'generationId')::uuid,'Late summary') THEN RAISE EXCEPTION 'STALE_MEMORY_ACCEPTED'; END IF;
 -- Retry the same request after starting another message. It must not wipe the new chat.
 PERFORM public.companion_begin_turn_v1(actor,replacement,gen_random_uuid(),'New conversation text');
 IF public.companion_change_history_v1(actor,conv,key,'clear')<>result THEN RAISE EXCEPTION 'RETRY_NOT_IDEMPOTENT'; END IF;
 IF (SELECT count(*) FROM public.companion_messages WHERE conversation_id=replacement)<>1 THEN RAISE EXCEPTION 'RETRY_ERASED_NEW_CHAT'; END IF;
 BEGIN PERFORM public.companion_change_history_v1(actor,conv,key,'delete'); RAISE EXCEPTION 'MISMATCH_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.companion_change_history_v1(actor,replacement,gen_random_uuid(),'delete');
 IF EXISTS(SELECT 1 FROM public.companion_conversations WHERE user_id=actor AND NOT archived) THEN RAISE EXCEPTION 'DELETED_CHAT_IN_LIST'; END IF;
 IF public.companion_change_history_v1(actor,conv,key,'clear')->>'conversationId' IS NOT NULL THEN RAISE EXCEPTION 'RETRY_RETURNS_RETIRED_REPLACEMENT'; END IF;
 reopened:=public.companion_open_conversation_v1(actor,character);
 IF reopened IN(conv,replacement) OR (SELECT greeting_message FROM public.companion_conversations WHERE id=reopened)<>'' THEN RAISE EXCEPTION 'REOPEN_RESTORED_OLD_CHAT'; END IF;
 IF public.companion_wallet_snapshot_v1(actor)<>wallet OR (SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id=actor)<>unlocks THEN RAISE EXCEPTION 'REOPEN_CHANGED_RIGHTS'; END IF;
 IF has_function_privilege('anon','public.companion_change_history_v1(uuid,uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.companion_change_history_v1(uuid,uuid,uuid,text)','EXECUTE') OR has_table_privilege('authenticated','public.companion_history_actions','SELECT') THEN RAISE EXCEPTION 'PUBLIC_HISTORY_PRIVILEGES'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
