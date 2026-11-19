-- Un pagamento con identità certa può avere già la propria riga manuale senza
-- collegamento. Prima di crearne una copia si richiede di verificare il legame.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_allinea_incasso(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'Pagamento possibile già nella prima nota manuale')>0 THEN RETURN; END IF;
  v_cerca:='  SELECT coalesce(sum(n.amount),0) INTO v_somma FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.invoice_id=p.invoice_id';
  IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Verifica degli incassi inattesa';END IF;
  EXECUTE replace(v_def,v_cerca,$body$  IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND NOT n.is_auto
      AND n.invoice_id IS NULL AND n.documento_fiscale_id IS NULL AND n.cost_id IS NULL AND n.reversal_of IS NULL
      AND n.direction=v_direzione AND abs(n.amount-abs(p.amount))<0.005 AND abs(n.entry_date-p.payment_date)<=3
      AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=n.company_id AND r.reversal_of=n.id)) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Pagamento possibile già nella prima nota manuale: verifica il collegamento');
  END IF;
$body$||v_cerca);
  SELECT pg_get_functiondef('private.prima_nota_allinea_incasso(uuid,boolean)'::regprocedure) INTO v_def;
  v_cerca:=$old$    IF NOT p_anteprima AND EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND is_auto AND auto_source='invoice_payment') THEN
      UPDATE public.prima_nota_entries SET invoice_payment_id=p.id WHERE id=v_pn;
    END IF;
    RETURN jsonb_build_object('esito','allineato');$old$;
  IF strpos(v_def,v_cerca)>0 THEN
    EXECUTE replace(v_def,v_cerca,$body$    IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND cost_id IS NULL AND documento_fiscale_id IS NULL) THEN
      IF NOT p_anteprima THEN
        UPDATE public.prima_nota_entries SET invoice_payment_id=p.id,is_auto=true,auto_source='invoice_payment' WHERE id=v_pn;
      END IF;
      RETURN jsonb_build_object('esito','collegabile','id',p.id,'prima_nota_id',v_pn);
    END IF;
    RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','La prima nota corrispondente ha un’altra fonte da verificare');$body$);
  END IF;
END $migration$;
