SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.bank_reconciliation_tenant_guard()'::regprocedure) INTO def;
 IF strpos(def,'''documenti_fiscali_native''')>0 THEN
  def:=replace(def,'''documenti_fiscali_native''','''documenti_fiscali''');EXECUTE def;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
