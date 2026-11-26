BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); user_a uuid:=gen_random_uuid(); user_b uuid:=gen_random_uuid(); convo_a uuid; convo_b uuid; payload jsonb; result jsonb;
BEGIN
 payload:=jsonb_build_object('name','Greeting fixture','archetype','Lifeguard','bio','Public statement','tags','[]'::jsonb,'system_prompt','Adult fictional character and scenario','first_message','  Hello from the character!  ','published',true,'cover_object_key',null);
 result:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload,null);
 IF result->>'first_message'<>'  Hello from the character!  ' THEN RAISE EXCEPTION 'GREETING_NOT_SAVED'; END IF;
 convo_a:=public.companion_open_conversation_v1(user_a,target);
 IF public.companion_open_conversation_v1(user_a,target)<>convo_a THEN RAISE EXCEPTION 'DUPLICATE_CONVERSATION'; END IF;
 IF (SELECT greeting_message FROM public.companion_conversations WHERE id=convo_a)<>'Hello from the character!' THEN RAISE EXCEPTION 'MISSING_GREETING_SNAPSHOT'; END IF;
 IF EXISTS(SELECT 1 FROM public.companion_chat_turns WHERE conversation_id=convo_a) OR EXISTS(SELECT 1 FROM public.companion_messages WHERE conversation_id=convo_a) OR EXISTS(SELECT 1 FROM public.companion_chat_count_events WHERE user_id=user_a) THEN RAISE EXCEPTION 'GREETING_CREATED_A_TURN'; END IF;
 IF (SELECT effective_chat_count FROM public.companion_user_character_progress WHERE user_id=user_a AND character_id=target)<>0 THEN RAISE EXCEPTION 'GREETING_INCREASED_PROGRESS'; END IF;
 payload:=payload||'{"first_message":"A new greeting"}';
 result:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload,0);
 PERFORM public.companion_open_conversation_v1(user_a,target);
 IF (SELECT greeting_message FROM public.companion_conversations WHERE id=convo_a)<>'Hello from the character!' THEN RAISE EXCEPTION 'GREETING_REWRITTEN'; END IF;
 result:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload-'first_message',1);
 IF result->>'first_message'<>'A new greeting' THEN RAISE EXCEPTION 'OLD_ADMIN_ERASED_GREETING'; END IF;
 convo_b:=public.companion_open_conversation_v1(user_b,target);
 IF (SELECT greeting_message FROM public.companion_conversations WHERE id=convo_b)<>'A new greeting' THEN RAISE EXCEPTION 'NEW_CHAT_MISSING_UPDATED_GREETING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companion_admin_audit WHERE target_id=target AND before_data->>'first_message'='  Hello from the character!  ' AND after_data->>'first_message'='A new greeting') THEN RAISE EXCEPTION 'GREETING_NOT_AUDITED'; END IF;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'admin','character.save',target,payload||jsonb_build_object('first_message',repeat('x',4001)),2); RAISE EXCEPTION 'OVERSIZE_GREETING_ACCEPTED'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'admin','character.save',target,payload,0); RAISE EXCEPTION 'STALE_GREETING_ACCEPTED'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF has_function_privilege('anon','public.companion_snapshot_greeting_v1()','execute') OR has_function_privilege('authenticated','public.companion_snapshot_greeting_v1()','execute') THEN RAISE EXCEPTION 'PUBLIC_GREETING_TRIGGER'; END IF;
 -- An empty existing greeting remains empty after later configuration changes.
 UPDATE public.companion_characters SET first_message='' WHERE id=target;
 result:=to_jsonb(public.companion_open_conversation_v1(gen_random_uuid(),target));
 UPDATE public.companion_characters SET first_message='Configured later' WHERE id=target;
 IF (SELECT greeting_message FROM public.companion_conversations WHERE id=(result#>>'{}')::uuid)<>'' THEN RAISE EXCEPTION 'BLANK_GREETING_BACKFILLED'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
