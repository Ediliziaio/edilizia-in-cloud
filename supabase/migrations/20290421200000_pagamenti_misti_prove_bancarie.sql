-- Una fattura può essere pagata in contanti e da conti diversi. Una prova
-- bancaria identifica soltanto la quota compatibile con quel conto.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_allinea_banca(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'esatti AS (')=0 THEN
    v_cerca:='     WHERE abs(p.amount-r.matched_amount)<0.005 AND abs(p.entry_date-t.booking_date)<=7';
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Candidati della prova bancaria inattesi';END IF;
    v_def:=replace(v_def,v_cerca,v_cerca||$body$
       AND lower(coalesce(p.account_label,'')) NOT LIKE 'cassa%'
       AND lower(coalesce(p.payment_method,'')) NOT IN('contanti','cash','mp01')$body$);
    v_def:=replace(v_def,'), precisi AS (','), esatti AS (');
    v_cerca:=$old$       AND (SELECT count(*) FROM candidati cc WHERE cc.quota=c.quota)=1
  ) SELECT (SELECT count(*) FROM candidati)$old$;
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Verifica univocità delle prove inattesa';END IF;
    EXECUTE replace(v_def,v_cerca,$new$  ), precisi AS (
    SELECT e.* FROM esatti e WHERE (SELECT count(*) FROM esatti x WHERE x.quota=e.quota)=1
  ) SELECT (SELECT count(*) FROM candidati)$new$);
  END IF;
  SELECT pg_get_functiondef('public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid)'::regprocedure) INTO v_def;
  IF strpos(v_def,'Questo pagamento è in contanti')=0 THEN
    v_cerca:='  if p_banca is null then raise exception ''Scegli il movimento bancario da collegare''; end if;';
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Collegamento della banca al pagamento inatteso';END IF;
    EXECUTE replace(v_def,v_cerca,$body$  if lower(coalesce(pn.payment_method,'')) in ('contanti','cash','mp01') or lower(coalesce(pn.account_label,'')) like 'cassa%' then
   raise exception 'Questo pagamento è in contanti: collega la banca alla quota pagata tramite conto.' using errcode='23514';
  end if;
$body$||v_cerca);
  END IF;
END $migration$;
