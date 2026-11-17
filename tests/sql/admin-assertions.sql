BEGIN;
CREATE FUNCTION public.test_admin_audit_deny() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.actor_id='a0000000-0000-4000-8000-000000000099' THEN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_admin_audit_deny BEFORE INSERT ON public.companion_admin_audit FOR EACH ROW EXECUTE FUNCTION public.test_admin_audit_deny();
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:='a0000000-0000-4000-8000-000000000001'; target uuid:='a0000000-0000-4000-8000-000000000002'; payload jsonb; result jsonb; n integer;
BEGIN
 IF has_function_privilege('authenticated','public.companion_admin_write_v1(uuid,text,text,uuid,jsonb,integer)','EXECUTE') OR has_table_privilege('anon','public.companion_admin_audit','SELECT') OR has_table_privilege('service_role','public.companion_admin_audit','UPDATE') OR has_table_privilege('service_role','public.companion_admin_audit','DELETE') OR has_table_privilege('service_role','public.companion_admin_audit','TRUNCATE') THEN RAISE EXCEPTION 'ADMIN_PRIVILEGES_LEAK'; END IF;
 payload:=jsonb_build_object('name','Admin fixture','archetype','Test','bio','','tags','[]'::jsonb,'system_prompt','Fictional adult character','published',false,'cover_object_key',null);
 result:=public.companion_admin_write_v1(actor,'editor','character.save',target,payload,null);
 IF result->>'revision'<>'0' THEN RAISE EXCEPTION 'INVALID_INITIAL_REVISION'; END IF;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'editor','character.save',target,payload,null);RAISE EXCEPTION 'DUPLICATE_CREATE_ACCEPTED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'viewer','character.save',target,payload,0);RAISE EXCEPTION 'VIEWER_WRITE_ACCEPTED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'editor','character.save',target,payload||'{"published":true}',0);RAISE EXCEPTION 'EDITOR_PUBLISH_ACCEPTED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 result:=public.companion_admin_write_v1(actor,'admin','character.save',target,payload||'{"published":true}',0);
 IF result->>'revision'<>'1' THEN RAISE EXCEPTION 'REVISION_NOT_UPDATED'; END IF;
 BEGIN PERFORM public.companion_admin_write_v1(actor,'admin','character.save',target,payload,0);RAISE EXCEPTION 'STALE_WRITE_ACCEPTED';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM public.companion_admin_write_v1('a0000000-0000-4000-8000-000000000099','admin','character.save',target,payload||'{"name":"Should rollback"}',1);RAISE EXCEPTION 'AUDIT_FAILURE_IGNORED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TEST_AUDIT_FAILURE' THEN RAISE;END IF;END;
 IF (SELECT name FROM public.companion_characters WHERE id=target)<>'Admin fixture' THEN RAISE EXCEPTION 'CONTENT_WITHOUT_AUDIT'; END IF;
 SELECT rules INTO payload FROM public.companion_global_level_config WHERE singleton;
 BEGIN PERFORM public.companion_admin_save_global_levels_v1('a0000000-0000-4000-8000-000000000099','admin','[{"level":1,"requiredCount":0},{"level":2,"requiredCount":7}]',(SELECT revision FROM public.companion_global_level_config WHERE singleton)); RAISE EXCEPTION 'GLOBAL_AUDIT_FAILURE_IGNORED'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TEST_AUDIT_FAILURE' THEN RAISE; END IF; END;
 IF (SELECT rules FROM public.companion_global_level_config WHERE singleton)<>payload THEN RAISE EXCEPTION 'GLOBAL_CONFIG_WITHOUT_AUDIT'; END IF;
 result:=public.companion_admin_save_global_levels_v1(actor,'admin','[{"level":1,"requiredCount":0},{"level":2,"requiredCount":10}]',(SELECT revision FROM public.companion_global_level_config WHERE singleton));
 IF jsonb_array_length(result->'rules')<>2 THEN RAISE EXCEPTION 'LEVEL_SAVE_FAILED'; END IF;
 SELECT count(*) INTO n FROM public.companion_admin_audit WHERE actor_id=actor;
 IF n<>3 THEN RAISE EXCEPTION 'AUDIT_COUNT_INVALID %',n; END IF;
END $$;
RESET ROLE;
ROLLBACK;
