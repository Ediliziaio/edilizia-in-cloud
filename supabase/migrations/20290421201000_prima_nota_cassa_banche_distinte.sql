-- L'identità del conto bancario prevale sul suo nome (es. «Cassa di Risparmio»).
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_allinea_banca(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'p.bank_account_id IS NOT NULL OR lower')=0 THEN
    v_cerca:=$old$       AND lower(coalesce(p.account_label,'')) NOT LIKE 'cassa%'$old$;
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Filtro cassa delle prove bancarie inatteso';END IF;
    EXECUTE replace(v_def,v_cerca,$new$       AND (p.bank_account_id IS NOT NULL OR lower(coalesce(p.account_label,'')) NOT LIKE 'cassa%')$new$);
  END IF;
  SELECT pg_get_functiondef('public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid)'::regprocedure) INTO v_def;
  IF strpos(v_def,'pn.bank_account_id is null and lower')=0 THEN
    v_cerca:=$old$ or lower(coalesce(pn.account_label,'')) like 'cassa%' then$old$;
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Controllo cassa del pagamento inatteso';END IF;
    EXECUTE replace(v_def,v_cerca,$new$ or (pn.bank_account_id is null and lower(coalesce(pn.account_label,'')) like 'cassa%') then$new$);
  END IF;
END $migration$;
