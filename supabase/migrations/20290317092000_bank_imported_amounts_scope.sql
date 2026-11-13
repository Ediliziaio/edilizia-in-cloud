SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('private.bank_record_imported(uuid,uuid,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'paid numeric;total numeric;','paid numeric;v_total numeric;');
 def:=replace(def,'INTO paid,total;','INTO paid,v_total;');
 def:=replace(def,'paid>total+','paid>v_total+');
 def:=replace(def,'paid>=total-','paid>=v_total-');
 EXECUTE def;
END $$;
