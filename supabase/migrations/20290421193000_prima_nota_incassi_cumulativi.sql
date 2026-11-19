-- Un incasso può saldare più fatture: il riferimento identifica il movimento
-- complessivo, mentre invoice_payments ne contiene le singole quote.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('private.prima_nota_allinea_incasso(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'quote di un incasso cumulativo')=0 THEN
    v_cerca:=$old$  IF p.reference LIKE 'prima_nota:%' THEN
    IF EXISTS$old$;
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Riferimento di prima nota inatteso';END IF;
    v_def:=replace(v_def,v_cerca,$body$  IF p.reference LIKE 'prima_nota:%' THEN
    -- quote di un incasso cumulativo: stesso riferimento, data e totale di cassa
    IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.id::text=substring(p.reference FROM 12)
        AND n.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=n.company_id AND r.reversal_of=n.id)
        AND abs((CASE WHEN n.direction='entrata' THEN n.amount ELSE -n.amount END)-
          (SELECT sum(CASE WHEN q.amount<0 OR d.document_type IN('credit_note','TD04','TD08') THEN -abs(q.amount) ELSE abs(q.amount) END)
             FROM public.invoice_payments q JOIN public.invoices d ON d.id=q.invoice_id AND d.company_id=q.company_id
            WHERE q.company_id=p.company_id AND q.reference=p.reference))<0.005
        AND NOT EXISTS(SELECT 1 FROM public.invoice_payments q WHERE q.company_id=p.company_id AND q.reference=p.reference
          AND (q.payment_date IS NULL OR q.payment_date<>n.entry_date))) THEN
      RETURN jsonb_build_object('esito','allineato','id',p.id);
    END IF;
    IF EXISTS$body$);
    v_def:=replace(v_def,$old$AND abs(n.entry_date-p.payment_date)<=3$old$,$new$AND (abs(n.entry_date-p.payment_date)<=3 OR (abs(n.entry_date-p.payment_date)<=31
        AND strip(to_tsvector('simple',n.description))=strip(to_tsvector('simple',i.client_company_name))))$new$);
    v_def:=replace(v_def,$old$    IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND cost_id IS NULL AND documento_fiscale_id IS NULL) THEN$old$,$new$    IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND bank_transaction_id IS NOT NULL) THEN
      RETURN jsonb_build_object('esito','allineato','id',p.id);
    END IF;
    IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND cost_id IS NULL AND documento_fiscale_id IS NULL) THEN$new$);
    v_cerca:='  SELECT coalesce(sum(n.amount),0) INTO v_somma FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.invoice_id=p.invoice_id';
    v_def:=replace(v_def,v_cerca,$body$  IF EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p.company_id AND r.unmatched_at IS NULL
        AND (r.invoice_id=p.invoice_id OR to_jsonb(r)->'payment_source'->>'invoice_id'=p.invoice_id::text
          OR to_jsonb(r)->'payment_source'->>'payment_id'=p.id::text)) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','La fattura ha una riconciliazione bancaria: verifica quote e date prima di aggiungere un incasso');
  END IF;
$body$||v_cerca);
    EXECUTE v_def;
  END IF;
  SELECT pg_get_functiondef('public.prima_nota_modifica(uuid,jsonb)'::regprocedure) INTO v_def;
  IF strpos(v_def,'movimento salda più fatture')=0 THEN
    v_cerca:='  v_motivo := public.prima_nota_modificabile(p);';
    IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Modifica della prima nota inattesa';END IF;
    EXECUTE replace(v_def,v_cerca,$body$  IF (SELECT count(*) FROM public.invoice_payments ip WHERE ip.company_id=p.company_id AND ip.reference='prima_nota:'||p.id)>1 THEN
    RAISE EXCEPTION 'Questo movimento salda più fatture: modifica le singole quote dai pagamenti delle fatture, poi verifica il totale.' USING ERRCODE='PT409';
  END IF;
$body$||v_cerca);
  END IF;
  SELECT pg_get_functiondef('public.prima_nota_allinea_fonti(uuid,boolean,text)'::regprocedure) INTO v_def;
  IF strpos(v_def,'strip(to_tsvector(''simple'',x.client_company_name))')=0 THEN
    EXECUTE replace(v_def,'AND abs(n.entry_date-x.payment_date)<=3',
      'AND (abs(n.entry_date-x.payment_date)<=3 OR (abs(n.entry_date-x.payment_date)<=31 AND strip(to_tsvector(''simple'',n.description))=strip(to_tsvector(''simple'',x.client_company_name))))');
  END IF;
  SELECT pg_get_functiondef('private.prima_nota_allinea_banca(uuid,boolean)'::regprocedure) INTO v_def;
  IF strpos(v_def,'fonti di cassa già esistenti')=0 THEN
    v_def:=replace(v_def,$old$      AND NOT n.is_auto AND n.reversal_of IS NULL AND n.invoice_id IS NULL AND n.documento_fiscale_id IS NULL AND n.cost_id IS NULL
      AND (n.account_label='banca' OR nullif(to_jsonb(n)->>'bank_account_id','') IS NOT NULL OR nullif(to_jsonb(n)->>'conto_liquidita_id','') IS NOT NULL)
      AND abs(n.amount-v_atteso)<0.005 AND abs(n.entry_date-t.booking_date)<=3$old$,$new$      -- fonti di cassa già esistenti: anche pagamenti automatici e quote separate
      AND n.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries rev WHERE rev.company_id=n.company_id AND rev.reversal_of=n.id)
      AND lower(coalesce(n.account_label,'banca')) NOT LIKE 'cassa%'
      AND (nullif(to_jsonb(n)->>'bank_account_id','') IS NULL OR to_jsonb(n)->>'bank_account_id'=to_jsonb(t)->>'account_id')
      AND (abs(n.amount-v_atteso)<0.005 OR EXISTS(SELECT 1 FROM public.bank_reconciliations q WHERE q.company_id=t.company_id
        AND q.transaction_id=t.id AND q.unmatched_at IS NULL AND abs(q.matched_amount-n.amount)<0.005))
      AND abs(n.entry_date-t.booking_date)<=3$new$);
    IF strpos(v_def,'fonti di cassa già esistenti')=0 THEN RAISE EXCEPTION 'Controllo dei pagamenti già in cassa inatteso';END IF;
    EXECUTE v_def;
  END IF;
END $migration$;
