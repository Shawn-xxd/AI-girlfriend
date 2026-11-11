BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); character uuid:=gen_random_uuid();
  conv uuid; other_conv uuid; photo uuid:=gen_random_uuid(); second_photo uuid:=gen_random_uuid();
  key uuid:=gen_random_uuid(); credit uuid; result jsonb; tx_count integer;
BEGIN
  INSERT INTO public.companion_users(id) VALUES(actor),(other_actor);
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Wallet test','Test','Temporary',true);
  conv:=public.companion_open_conversation_v1(actor,character);
  other_conv:=public.companion_open_conversation_v1(other_actor,character);
  INSERT INTO public.companion_photos(id,character_id,kind,object_key,review_status,published,diamond_price)
    VALUES(photo,character,'diamond','wallet-test/a','approved',true,7),(second_photo,character,'diamond','wallet-test/b','approved',true,7);
  IF public.companion_wallet_snapshot_v1(actor)<>jsonb_build_object('availableDiamonds',0,'pendingRecovery',0) THEN RAISE EXCEPTION 'Initial wallet'; END IF;
  BEGIN
    PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,photo,key,7);
    RAISE EXCEPTION 'Insufficient funds accepted';
  EXCEPTION WHEN SQLSTATE 'PT402' THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.companion_photo_unlock_requests WHERE user_id=actor) THEN RAISE EXCEPTION 'Failed request persisted'; END IF;
  credit:=public.companion_credit_wallet_v1(actor,14,'wallet-assertions-credit');
  IF public.companion_credit_wallet_v1(actor,14,'wallet-assertions-credit')<>credit THEN RAISE EXCEPTION 'Credit not idempotent'; END IF;
  BEGIN
    PERFORM public.companion_credit_wallet_v1(actor,15,'wallet-assertions-credit');
    RAISE EXCEPTION 'Credit conflict accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.companion_unlock_diamond_photo_v1(actor,other_conv,photo,key,7);
    RAISE EXCEPTION 'Other conversation accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  BEGIN
    PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,photo,key,6);
    RAISE EXCEPTION 'Price mismatch accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  result:=public.companion_unlock_diamond_photo_v1(actor,conv,photo,key,7);
  IF (result->>'chargedDiamonds')::int<>7 OR (result->'wallet'->>'availableDiamonds')::int<>7 THEN RAISE EXCEPTION 'Unlock balance'; END IF;
  PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,photo,key,7);
  result:=public.companion_unlock_diamond_photo_v1(actor,conv,photo,gen_random_uuid(),7);
  IF (result->>'chargedDiamonds')::int<>0 THEN RAISE EXCEPTION 'Owned photo charged'; END IF;
  BEGIN
    PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,second_photo,key,7);
    RAISE EXCEPTION 'Request reused for different photo';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.companion_unlock_diamond_photo_v1(actor,conv,second_photo,gen_random_uuid(),7);
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM public.companion_wallet_transactions WHERE user_id=actor AND kind='spend')<>2 THEN RAISE EXCEPTION 'Duplicate spend'; END IF;
  PERFORM public.companion_reverse_credit_v1(credit,'wallet-assertions-refund');
  PERFORM public.companion_reverse_credit_v1(credit,'wallet-assertions-refund');
  BEGIN
    PERFORM public.companion_reverse_credit_v1(credit,'wallet-assertions-duplicate-event');
    RAISE EXCEPTION 'Duplicate refund event accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF public.companion_wallet_snapshot_v1(actor)<>jsonb_build_object('availableDiamonds',0,'pendingRecovery',14) THEN RAISE EXCEPTION 'Refund debt'; END IF;
  IF (SELECT count(*) FROM public.companion_photo_unlocks WHERE user_id=actor)<>2 THEN RAISE EXCEPTION 'Refund revoked photos'; END IF;
  PERFORM public.companion_credit_wallet_v1(actor,5,'wallet-assertions-small-credit');
  IF public.companion_wallet_snapshot_v1(actor)<>jsonb_build_object('availableDiamonds',0,'pendingRecovery',9) THEN RAISE EXCEPTION 'Recovery priority'; END IF;
  PERFORM public.companion_credit_wallet_v1(actor,20,'wallet-assertions-large-credit');
  IF public.companion_wallet_snapshot_v1(actor)<>jsonb_build_object('availableDiamonds',11,'pendingRecovery',0) THEN RAISE EXCEPTION 'Recovery settlement'; END IF;
  BEGIN
    UPDATE public.companion_wallets SET balance=1000 WHERE user_id=actor;
    RAISE EXCEPTION 'Direct balance update accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  SELECT count(*) INTO tx_count FROM public.companion_wallet_transactions WHERE user_id=actor;
  BEGIN
    INSERT INTO public.companion_wallet_transactions(user_id,kind,amount,balance_after,source_key,photo_id)
      VALUES(actor,'spend',-1,0,'wallet-test/orphan',photo);
    RAISE EXCEPTION 'Orphan spend accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF (SELECT count(*) FROM public.companion_wallet_transactions WHERE user_id=actor)<>tx_count OR
     (public.companion_wallet_snapshot_v1(actor)->>'availableDiamonds')::int<>11 THEN RAISE EXCEPTION 'Rollback failed'; END IF;
  UPDATE public.companion_photos SET published=false WHERE id=photo;
  result:=public.companion_unlock_diamond_photo_v1(actor,conv,photo,gen_random_uuid(),7);
  IF (result->>'chargedDiamonds')::int<>0 THEN RAISE EXCEPTION 'Unpublished owned photo charged'; END IF;
  IF jsonb_array_length(public.companion_gallery_v1(actor,conv)->'photos')<>2 THEN RAISE EXCEPTION 'Owned unpublished photo missing'; END IF;
  IF jsonb_array_length(public.companion_gallery_v1(other_actor,other_conv)->'photos')<>1 THEN RAISE EXCEPTION 'Other owner gallery leaked'; END IF;
  IF has_table_privilege('authenticated','public.companion_wallets','SELECT') OR
    has_table_privilege('anon','public.companion_wallet_transactions','INSERT') OR
    has_function_privilege('authenticated','public.companion_credit_wallet_v1(uuid,integer,text)','EXECUTE') OR
    has_function_privilege('anon','public.companion_unlock_diamond_photo_v1(uuid,uuid,uuid,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Client wallet privileges'; END IF;
  DELETE FROM public.companion_user_character_progress WHERE user_id=actor;
  DELETE FROM public.companion_wallets WHERE user_id=actor;
  IF EXISTS(SELECT 1 FROM public.companion_wallet_transactions WHERE user_id=actor) THEN RAISE EXCEPTION 'Test maintenance cleanup failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
