-- Gli incassi importati possono essere collegati a documenti storici diversi
-- dalle successive copie XML. Il nome e l'importo sono indizi, non una prova.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_allinea_incasso(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'Incasso importato per la stessa controparte')=0 THEN
    v_cerca:='  SELECT coalesce(sum(n.amount),0) INTO v_somma FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.invoice_id=p.invoice_id';
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Confronto degli incassi importati inatteso';END IF;
    EXECUTE replace(v_def,v_cerca,$body$  IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND NOT n.is_auto
        AND to_jsonb(n)->>'reconciliation_method'='imported' AND n.invoice_payment_id IS NULL
        AND n.reversal_of IS NULL AND n.direction=v_direzione AND abs(n.amount-abs(p.amount))<0.005
        AND abs(n.entry_date-p.payment_date)<=31 AND nullif(btrim(i.client_company_name),'') IS NOT NULL
        AND strip(to_tsvector('simple',n.description))=strip(to_tsvector('simple',i.client_company_name))
        AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=n.company_id AND r.reversal_of=n.id)) THEN
      RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Incasso importato per la stessa controparte e importo: confronta le fatture e le date prima di aggiungere un movimento');
    END IF;
$body$||v_cerca);
  END IF;
  SELECT pg_get_functiondef('private.prima_nota_allinea_banca(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'Una registrazione bancaria manuale potrebbe già rappresentare questo movimento')>0 THEN
    EXECUTE replace(v_def,'Una registrazione bancaria manuale potrebbe già rappresentare questo movimento',
      'Un movimento di cassa già presente potrebbe rappresentare questa operazione: verifica il collegamento');
  END IF;
END $migration$;
