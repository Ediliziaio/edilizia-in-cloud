-- Una banca archiviata resta la banca dei suoi movimenti storici. Si vietano
-- nuove registrazioni manuali sul conto inattivo; si conserva lo storico certo.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_conto_stessa_azienda()'::regprocedure) INTO v_def;
  IF strpos(v_def,'NOT coalesce(v_attivo,false) AND NEW.bank_transaction_id IS NULL')>0 THEN RETURN; END IF;
  v_cerca:='NOT coalesce(v_attivo,false) AND (TG_OP=';
  IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Controllo del conto bancario inatteso';END IF;
  EXECUTE replace(v_def,v_cerca,'NOT coalesce(v_attivo,false) AND NEW.bank_transaction_id IS NULL AND (TG_OP=');
END $migration$;
