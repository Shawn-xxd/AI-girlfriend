BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261110000100') THEN RAISE EXCEPTION 'Memory migration missing'; END IF;
  IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261111000100' AND checksum<>'b01215ded051d00f858faa0f156e594655c0a8a8d725b071acb83555a546300d') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE TABLE IF NOT EXISTS public.companion_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.companion_users(id) ON DELETE RESTRICT,
  balance bigint NOT NULL DEFAULT 0 CHECK(balance BETWEEN -9000000000000 AND 9000000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.companion_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.companion_wallets(user_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('credit','spend','reversal')),
  amount integer NOT NULL CHECK(amount<>0),
  balance_after bigint NOT NULL,
  source_key text NOT NULL UNIQUE CHECK(length(source_key) BETWEEN 1 AND 256),
  photo_id uuid,
  reversal_of uuid UNIQUE REFERENCES public.companion_wallet_transactions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind='credit' AND amount>0 AND photo_id IS NULL AND reversal_of IS NULL) OR
    (kind='spend' AND amount<0 AND photo_id IS NOT NULL AND reversal_of IS NULL) OR
    (kind='reversal' AND amount<0 AND photo_id IS NULL AND reversal_of IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS companion_wallet_transactions_owner_idx ON public.companion_wallet_transactions(user_id,created_at DESC,id);
ALTER TABLE public.companion_photos ADD COLUMN IF NOT EXISTS diamond_price integer CHECK(diamond_price BETWEEN 1 AND 1000000000);
UPDATE public.companion_photos SET published=false WHERE kind='diamond' AND published AND diamond_price IS NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='companion_photo_price_valid') THEN
    ALTER TABLE public.companion_photos ADD CONSTRAINT companion_photo_price_valid CHECK
      ((kind='level' AND diamond_price IS NULL) OR (kind='diamond' AND (NOT published OR diamond_price IS NOT NULL)));
  END IF;
END $$;
ALTER TABLE public.companion_photo_unlocks ADD COLUMN IF NOT EXISTS unlock_kind text NOT NULL DEFAULT 'level';
ALTER TABLE public.companion_photo_unlocks ADD COLUMN IF NOT EXISTS wallet_transaction_id uuid UNIQUE REFERENCES public.companion_wallet_transactions(id) ON DELETE RESTRICT;
ALTER TABLE public.companion_photo_unlocks ALTER COLUMN earned_level DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='companion_unlock_kind_valid') THEN
    ALTER TABLE public.companion_photo_unlocks ADD CONSTRAINT companion_unlock_kind_valid CHECK
      ((unlock_kind='level' AND earned_level IS NOT NULL AND wallet_transaction_id IS NULL) OR
       (unlock_kind='diamond' AND earned_level IS NULL AND wallet_transaction_id IS NOT NULL));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.companion_photo_unlock_requests (
  user_id uuid NOT NULL REFERENCES public.companion_wallets(user_id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  photo_id uuid NOT NULL,
  expected_price integer NOT NULL CHECK(expected_price BETWEEN 1 AND 1000000000),
  charged_diamonds integer NOT NULL CHECK(charged_diamonds>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key)
);
ALTER TABLE public.companion_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companion_photo_unlock_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_wallets,public.companion_wallet_transactions,public.companion_photo_unlock_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.companion_wallets TO service_role;
GRANT SELECT,INSERT ON public.companion_wallet_transactions,public.companion_photo_unlock_requests TO service_role;

CREATE OR REPLACE FUNCTION public.companion_wallet_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.balance<>0) OR
    (TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR (NEW.balance<>OLD.balance AND pg_trigger_depth()<2))) THEN
    RAISE EXCEPTION 'LEDGER_REQUIRED' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_wallet_guard ON public.companion_wallets;
CREATE TRIGGER companion_wallet_guard BEFORE INSERT OR UPDATE ON public.companion_wallets FOR EACH ROW EXECUTE FUNCTION public.companion_wallet_guard_v1();
CREATE OR REPLACE FUNCTION public.companion_wallet_post_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE net bigint; original public.companion_wallet_transactions;
BEGIN
  IF TG_OP='DELETE' THEN
    IF pg_trigger_depth()>1 AND NOT EXISTS(SELECT 1 FROM public.companion_wallets WHERE user_id=OLD.user_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'IMMUTABLE_LEDGER' USING ERRCODE='PT409';
  ELSIF TG_OP='UPDATE' THEN RAISE EXCEPTION 'IMMUTABLE_LEDGER' USING ERRCODE='PT409'; END IF;
  SELECT balance INTO net FROM public.companion_wallets WHERE user_id=NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NEW.kind='reversal' THEN
    SELECT * INTO original FROM public.companion_wallet_transactions WHERE id=NEW.reversal_of;
    IF NOT FOUND OR original.user_id<>NEW.user_id OR original.kind<>'credit' OR NEW.amount<>-original.amount THEN
      RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='PT409';
    END IF;
  END IF;
  net:=net+NEW.amount;
  IF NEW.kind='spend' AND net<0 THEN RAISE EXCEPTION 'INSUFFICIENT_DIAMONDS' USING ERRCODE='PT402'; END IF;
  NEW.balance_after:=net;
  UPDATE public.companion_wallets SET balance=net,updated_at=clock_timestamp() WHERE user_id=NEW.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_wallet_post ON public.companion_wallet_transactions;
CREATE TRIGGER companion_wallet_post BEFORE INSERT OR UPDATE OR DELETE ON public.companion_wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.companion_wallet_post_v1();
CREATE OR REPLACE FUNCTION public.companion_wallet_snapshot_v1(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE net bigint;
BEGIN
  INSERT INTO public.companion_wallets(user_id) VALUES(p_actor) ON CONFLICT DO NOTHING;
  SELECT balance INTO net FROM public.companion_wallets WHERE user_id=p_actor;
  RETURN jsonb_build_object('availableDiamonds',greatest(0,net),'pendingRecovery',greatest(0,-net));
END $$;
-- Trusted server maintenance only. No public credit/refund HTTP endpoint or Apple verification claim.
CREATE OR REPLACE FUNCTION public.companion_credit_wallet_v1(p_actor uuid,p_amount integer,p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE existing public.companion_wallet_transactions; result uuid;
BEGIN
  IF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 1000000000 OR p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_CREDIT' USING ERRCODE='PT400';
  END IF;
  PERFORM public.companion_wallet_snapshot_v1(p_actor);
  PERFORM 1 FROM public.companion_wallets WHERE user_id=p_actor FOR UPDATE;
  SELECT * INTO existing FROM public.companion_wallet_transactions WHERE source_key='credit/'||p_reference;
  IF FOUND THEN
    IF existing.user_id<>p_actor OR existing.amount<>p_amount THEN RAISE EXCEPTION 'CREDIT_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO public.companion_wallet_transactions(user_id,kind,amount,balance_after,source_key)
    VALUES(p_actor,'credit',p_amount,0,'credit/'||p_reference) RETURNING id INTO result;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.companion_reverse_credit_v1(p_credit uuid,p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE original public.companion_wallet_transactions; existing public.companion_wallet_transactions; result uuid;
BEGIN
  IF p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='PT400'; END IF;
  SELECT * INTO original FROM public.companion_wallet_transactions WHERE id=p_credit AND kind='credit';
  IF NOT FOUND THEN RAISE EXCEPTION 'CREDIT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.companion_wallets WHERE user_id=original.user_id FOR UPDATE;
  SELECT * INTO existing FROM public.companion_wallet_transactions WHERE source_key='reversal/'||p_reference;
  IF FOUND THEN
    IF existing.reversal_of<>p_credit THEN RAISE EXCEPTION 'REVERSAL_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN existing.id;
  END IF;
  SELECT id INTO result FROM public.companion_wallet_transactions WHERE reversal_of=p_credit;
  IF FOUND THEN RAISE EXCEPTION 'CREDIT_ALREADY_REVERSED' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.companion_wallet_transactions(user_id,kind,amount,balance_after,source_key,reversal_of)
    VALUES(original.user_id,'reversal',-original.amount,0,'reversal/'||p_reference,p_credit) RETURNING id INTO result;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.companion_validate_unlock_spend_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE photo_kind text;
BEGIN
  SELECT kind INTO photo_kind FROM public.companion_photos WHERE id=NEW.photo_id AND character_id=NEW.character_id FOR SHARE;
  IF photo_kind IS DISTINCT FROM NEW.unlock_kind THEN RAISE EXCEPTION 'UNLOCK_KIND_MISMATCH' USING ERRCODE='PT409'; END IF;
  IF NEW.unlock_kind='diamond' AND NOT EXISTS(SELECT 1 FROM public.companion_wallet_transactions
    WHERE id=NEW.wallet_transaction_id AND user_id=NEW.user_id AND photo_id=NEW.photo_id AND kind='spend') THEN
    RAISE EXCEPTION 'SPEND_REQUIRED' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companion_validate_unlock_spend ON public.companion_photo_unlocks;
CREATE TRIGGER companion_validate_unlock_spend BEFORE INSERT OR UPDATE ON public.companion_photo_unlocks FOR EACH ROW EXECUTE FUNCTION public.companion_validate_unlock_spend_v1();
CREATE OR REPLACE FUNCTION public.companion_spend_requires_unlock_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.kind='spend' AND NOT EXISTS(SELECT 1 FROM public.companion_photo_unlocks
    WHERE wallet_transaction_id=NEW.id AND photo_id=NEW.photo_id AND user_id=NEW.user_id) THEN
    RAISE EXCEPTION 'UNLOCK_REQUIRED' USING ERRCODE='PT409';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS companion_spend_requires_unlock ON public.companion_wallet_transactions;
CREATE CONSTRAINT TRIGGER companion_spend_requires_unlock AFTER INSERT ON public.companion_wallet_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.companion_spend_requires_unlock_v1();
CREATE OR REPLACE FUNCTION public.companion_unlock_diamond_photo_v1(p_actor uuid,p_conversation uuid,p_photo uuid,p_key uuid,p_expected_price integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE character uuid; photo public.companion_photos; prior public.companion_photo_unlock_requests; charge integer:=0; tx uuid;
BEGIN
  IF p_key IS NULL OR p_expected_price IS NULL OR p_expected_price NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_UNLOCK' USING ERRCODE='PT400'; END IF;
  SELECT character_id INTO character FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM public.companion_wallet_snapshot_v1(p_actor);
  PERFORM 1 FROM public.companion_wallets WHERE user_id=p_actor FOR UPDATE;
  SELECT * INTO photo FROM public.companion_photos WHERE id=p_photo AND character_id=character AND kind='diamond' AND review_status='approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PHOTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO prior FROM public.companion_photo_unlock_requests WHERE user_id=p_actor AND request_key=p_key;
  IF FOUND THEN
    IF prior.photo_id<>p_photo OR prior.expected_price<>p_expected_price THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('photoId',p_photo,'chargedDiamonds',prior.charged_diamonds,'wallet',public.companion_wallet_snapshot_v1(p_actor));
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companion_photo_unlocks WHERE user_id=p_actor AND photo_id=p_photo) THEN
    IF NOT photo.published OR photo.diamond_price IS NULL THEN RAISE EXCEPTION 'PHOTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF photo.diamond_price<>p_expected_price THEN RAISE EXCEPTION 'PRICE_CHANGED' USING ERRCODE='PT409'; END IF;
    charge:=photo.diamond_price;
    INSERT INTO public.companion_wallet_transactions(user_id,kind,amount,balance_after,source_key,photo_id)
      VALUES(p_actor,'spend',-charge,0,'photo/'||p_actor::text||'/'||p_key::text,p_photo) RETURNING id INTO tx;
    INSERT INTO public.companion_user_character_progress(user_id,character_id) VALUES(p_actor,character) ON CONFLICT DO NOTHING;
    INSERT INTO public.companion_photo_unlocks(user_id,character_id,photo_id,earned_level,unlock_kind,wallet_transaction_id)
      VALUES(p_actor,character,p_photo,NULL,'diamond',tx);
  END IF;
  INSERT INTO public.companion_photo_unlock_requests(user_id,request_key,photo_id,expected_price,charged_diamonds)
    VALUES(p_actor,p_key,p_photo,p_expected_price,charge);
  RETURN jsonb_build_object('photoId',p_photo,'chargedDiamonds',charge,'wallet',public.companion_wallet_snapshot_v1(p_actor));
END $$;
CREATE OR REPLACE FUNCTION public.companion_gallery_v1(p_actor uuid,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE character uuid; levels jsonb; diamonds jsonb;
BEGIN
  levels:=public.companion_level_photos_v1(p_actor,p_conversation);
  SELECT character_id INTO character FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'kind','diamond','title',p.title,'requiredLevel',NULL,
    'diamonds',p.diamond_price,'unlocked',u.id IS NOT NULL,'available',true) ORDER BY p.created_at,p.id),'[]'::jsonb)
    INTO diamonds FROM public.companion_photos p LEFT JOIN public.companion_photo_unlocks u ON u.photo_id=p.id AND u.user_id=p_actor
    WHERE p.character_id=character AND p.kind='diamond' AND p.review_status='approved' AND (p.published OR u.id IS NOT NULL);
  RETURN jsonb_build_object('photos',(levels->'photos')||diamonds,'progress',levels->'progress');
END $$;
REVOKE ALL ON FUNCTION public.companion_wallet_guard_v1(),public.companion_wallet_post_v1(),public.companion_wallet_snapshot_v1(uuid),
  public.companion_credit_wallet_v1(uuid,integer,text),public.companion_reverse_credit_v1(uuid,text),public.companion_validate_unlock_spend_v1(),
  public.companion_spend_requires_unlock_v1(),public.companion_unlock_diamond_photo_v1(uuid,uuid,uuid,uuid,integer),public.companion_gallery_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_wallet_guard_v1(),public.companion_wallet_post_v1(),public.companion_wallet_snapshot_v1(uuid),
  public.companion_credit_wallet_v1(uuid,integer,text),public.companion_reverse_credit_v1(uuid,text),public.companion_validate_unlock_spend_v1(),
  public.companion_spend_requires_unlock_v1(),public.companion_unlock_diamond_photo_v1(uuid,uuid,uuid,uuid,integer),public.companion_gallery_v1(uuid,uuid) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum)
VALUES ('20261111000100', 'b01215ded051d00f858faa0f156e594655c0a8a8d725b071acb83555a546300d') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
