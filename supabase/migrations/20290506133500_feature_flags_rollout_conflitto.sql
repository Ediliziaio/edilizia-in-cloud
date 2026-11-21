-- Una anteprima superata è un conflitto applicativo. PostgREST deve restituire 409 senza ritentare l'operazione.
DO $$
DECLARE
  v_definition text := pg_get_functiondef('public.admin_apply_feature_rollout(text,uuid[],jsonb)'::regprocedure);
BEGIN
  IF strpos(v_definition, '''40001''') > 0 THEN
    EXECUTE replace(v_definition, '''40001''', '''PT409''');
  END IF;
END;
$$;
