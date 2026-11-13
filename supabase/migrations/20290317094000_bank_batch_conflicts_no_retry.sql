SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.bank_conferma_lotto(uuid,uuid,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'''40001''','''PT409''');EXECUTE def;
END $$;
