-- Executed only in the isolated schema database, before the new migration.
DO $$
DECLARE actor uuid:='71000000-0000-4000-8000-000000000001'; character uuid:='71000000-0000-4000-8000-000000000002'; conv uuid; claim jsonb;
BEGIN
  INSERT INTO public.companion_characters(id,name,archetype,bio,published) VALUES(character,'Historical Fixture','Test','Fixture',true);
  conv:=public.companion_open_conversation_v1(actor,character);
  claim:=public.companion_begin_turn_v1(actor,conv,gen_random_uuid(),'Historical success');
  PERFORM public.companion_complete_turn_v1(actor,(claim->>'turnId')::uuid,(claim->>'generationId')::uuid,'Historical reply','test','test',1,1);
END $$;
