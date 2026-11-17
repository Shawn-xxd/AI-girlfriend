BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); payload jsonb; saved jsonb;
BEGIN
 payload:='{"name":"Avatar fixture","archetype":"Test","bio":"","tags":[],"system_prompt":"Fictional adult","published":false,"cover_object_key":null}';
 saved:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload,NULL);
 IF saved->>'avatar_focus_y'<>'0.2' THEN RAISE EXCEPTION 'DEFAULT_AVATAR_FRAMING_MISSING'; END IF;
 saved:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload||'{"avatar_focus_y":0}',0);
 IF saved->>'avatar_focus_y'<>'0' THEN RAISE EXCEPTION 'AVATAR_FRAMING_NOT_SAVED'; END IF;
 saved:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload,1);
 IF saved->>'avatar_focus_y'<>'0' THEN RAISE EXCEPTION 'LEGACY_PAYLOAD_RESET_FRAMING'; END IF;
 BEGIN
  PERFORM public.companion_admin_write_v1(actor,'admin','character.save',target,payload||'{"avatar_focus_y":1.1}',2);
  RAISE EXCEPTION 'INVALID_AVATAR_FRAMING_ACCEPTED' USING ERRCODE='XX000';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT revision FROM public.companion_characters WHERE id=target)<>2 OR (SELECT count(*) FROM public.companion_admin_audit WHERE actor_id=actor)<>3 THEN RAISE EXCEPTION 'INVALID_AVATAR_WRITE_NOT_ATOMIC'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
