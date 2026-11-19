-- Anche il riepilogo usa l'identità della banca, senza dedurla dal nome.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('public.dettaglio_pagamento_costo(uuid)'::regprocedure) INTO v_def;
  IF strpos(v_def,'''bank_account_id'',p.bank_account_id')=0 THEN
    v_cerca:='''metodo'',p.payment_method';
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Dettaglio del metodo di pagamento inatteso';END IF;
    EXECUTE replace(v_def,v_cerca,v_cerca||',''bank_account_id'',p.bank_account_id');
  END IF;
END $migration$;
