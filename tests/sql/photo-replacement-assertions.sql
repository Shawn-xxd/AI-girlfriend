BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); other_buyer uuid:=gen_random_uuid(); character uuid:=gen_random_uuid();
 photo uuid:=gen_random_uuid(); reward uuid:=gen_random_uuid(); conv uuid; other_conv uuid; payload jsonb; result jsonb; tx_count integer; unlock_count integer; progress_before jsonb;
BEGIN
 INSERT INTO public.companion_users(id) VALUES(buyer),(other_buyer);
 INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Replacement fixture','Test','Temporary',true);
 conv:=public.companion_open_conversation_v1(buyer,character);
 other_conv:=public.companion_open_conversation_v1(other_buyer,character);
 INSERT INTO public.companion_photos(id,character_id,kind,required_level,diamond_price,object_key,review_status,published)
 VALUES(photo,character,'diamond',NULL,9,'replace-test/paid-original.png','approved',true),
       (reward,character,'level',1,NULL,'replace-test/level-original.png','approved',true);
 PERFORM public.companion_credit_wallet_v1(buyer,9,'replace-test-credit-a');
 PERFORM public.companion_credit_wallet_v1(other_buyer,9,'replace-test-credit-b');
 PERFORM public.companion_unlock_diamond_photo_v1(buyer,conv,photo,gen_random_uuid(),9);
 PERFORM public.companion_unlock_diamond_photo_v1(other_buyer,other_conv,photo,gen_random_uuid(),9);
 PERFORM public.companion_sync_progress_v1(buyer,conv);
 PERFORM public.companion_sync_progress_v1(other_buyer,other_conv);
 SELECT count(*) INTO tx_count FROM public.companion_wallet_transactions WHERE user_id IN (buyer,other_buyer);
 SELECT count(*) INTO unlock_count FROM public.companion_photo_unlocks WHERE photo_id IN (photo,reward);
 progress_before:=public.companion_progress_snapshot_v1(buyer,conv);
 SELECT to_jsonb(p) INTO payload FROM public.companion_photos p WHERE id=photo;
 payload:=payload||'{"object_key":"replace-test/paid-replacement.png"}';
 BEGIN
   PERFORM public.companion_admin_write_v1(actor,'editor','photo.save',photo,payload||'{"published":false,"review_status":"draft"}',0);
   RAISE EXCEPTION 'EDITOR_REPLACEMENT_ACCEPTED' USING ERRCODE='XX000';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 result:=public.companion_admin_write_v1(actor,'admin','photo.save',photo,payload,0);
 IF result->>'id'<>photo::text OR result->>'object_key'<>'replace-test/paid-replacement.png' OR result->>'revision'<>'1' THEN RAISE EXCEPTION 'REPLACEMENT_NOT_ATOMIC'; END IF;
 SELECT to_jsonb(p) INTO payload FROM public.companion_photos p WHERE id=reward;
 PERFORM public.companion_admin_write_v1(actor,'admin','photo.save',reward,payload||'{"object_key":"replace-test/level-replacement.png"}',0);
 IF (SELECT count(*) FROM public.companion_photo_unlocks WHERE photo_id IN (photo,reward))<>unlock_count THEN RAISE EXCEPTION 'REPLACEMENT_CHANGED_RIGHTS'; END IF;
 IF (SELECT count(*) FROM public.companion_wallet_transactions WHERE user_id IN (buyer,other_buyer))<>tx_count THEN RAISE EXCEPTION 'REPLACEMENT_CHANGED_WALLET'; END IF;
 IF public.companion_progress_snapshot_v1(buyer,conv)<>progress_before THEN RAISE EXCEPTION 'REPLACEMENT_RESET_PROGRESS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.companion_gallery_v1(buyer,conv)->'photos') p WHERE p->>'id'=photo::text AND p->>'unlocked'='true') THEN RAISE EXCEPTION 'BUYER_LOST_ACCESS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.companion_gallery_v1(other_buyer,other_conv)->'photos') p WHERE p->>'id'=photo::text AND p->>'unlocked'='true') THEN RAISE EXCEPTION 'OTHER_BUYER_LOST_ACCESS'; END IF;
 result:=public.companion_unlock_diamond_photo_v1(buyer,conv,photo,gen_random_uuid(),9);
 IF result->>'chargedDiamonds'<>'0' THEN RAISE EXCEPTION 'REPLACEMENT_CHARGED_AGAIN'; END IF;
 IF (SELECT count(*) FROM public.companion_admin_audit WHERE actor_id=actor AND action='photo.save')<>2 THEN RAISE EXCEPTION 'REPLACEMENT_AUDIT_MISSING'; END IF;
 BEGIN UPDATE public.companion_photos SET required_level=2 WHERE id=reward; RAISE EXCEPTION 'EARNED_CONDITION_CHANGED' USING ERRCODE='XX000'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'admin','photo.save',reward,payload,0); RAISE EXCEPTION 'STALE_REPLACEMENT_ACCEPTED' USING ERRCODE='XX000'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
