BEGIN;
SELECT pg_advisory_xact_lock(740831501);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261125032534' AND checksum<>'1e4f5d50ce676e06d237af68e09c12638e4bcf607fa1ad6f5728cf3042087b4a') THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companion_schema_migrations WHERE version='20261117140627') THEN RAISE EXCEPTION 'Avatar framing migration missing'; END IF;
END $$;
-- BEGIN MIGRATION BODY
CREATE OR REPLACE FUNCTION public.companion_progress_snapshot_v1(p_actor uuid,p_conversation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE conv public.companion_conversations; progress public.companion_user_character_progress;
  config jsonb; upcoming jsonb; current_required integer;
BEGIN
  SELECT * INTO conv FROM public.companion_conversations WHERE id=p_conversation AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO progress FROM public.companion_user_character_progress WHERE user_id=p_actor AND character_id=conv.character_id;
  SELECT rules INTO config FROM public.companion_global_level_config WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'GLOBAL_LEVEL_RULES_MISSING' USING ERRCODE='P0002'; END IF;
  SELECT (r->>'requiredCount')::integer INTO current_required FROM jsonb_array_elements(config) r
    WHERE (r->>'level')::integer=coalesce(progress.level,1);
  SELECT jsonb_build_object('level',(r->>'level')::integer,'requiredCount',(r->>'requiredCount')::integer) INTO upcoming
    FROM jsonb_array_elements(config) r
    WHERE (r->>'level')::integer>coalesce(progress.level,1)
    ORDER BY (r->>'level')::integer LIMIT 1;
  RETURN jsonb_build_object('level',coalesce(progress.level,1),
    'effectiveChatCount',coalesce(progress.effective_chat_count,0),
    'currentLevelRequiredCount',coalesce(current_required,0),'nextLevel',upcoming);
END $$;
REVOKE ALL ON FUNCTION public.companion_progress_snapshot_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.companion_progress_snapshot_v1(uuid,uuid) TO service_role;
-- END MIGRATION BODY
INSERT INTO public.companion_schema_migrations(version,checksum) VALUES ('20261125032534', '1e4f5d50ce676e06d237af68e09c12638e4bcf607fa1ad6f5728cf3042087b4a') ON CONFLICT(version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
