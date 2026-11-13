-- Historical payment proofs retain document IDs after the source payment is removed.
-- Do not suggest the same rejected/removed pairing again from that snapshot.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.bank_suggerisci_riconciliazioni(p_company uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true);END IF;
 WITH tx AS MATERIALIZED(SELECT * FROM public.bank_transactions t WHERE company_id=p_company AND status='booked' AND currency='EUR'
  AND reconciliation_status='pending' AND proposta_rifiutata_at IS NULL AND chiuso_senza_documento IS NULL
  AND linked_invoice_id IS NULL AND linked_scadenza_id IS NULL AND linked_cost_id IS NULL AND linked_installment_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.transaction_id=t.id AND r.unmatched_at IS NULL)
  ORDER BY proposta_controllata_at ASC NULLS FIRST,booking_date DESC,id LIMIT 100),
 candidates AS(
 SELECT d.id,d.numero title,coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome')) party,d.totale_da_pagare-d.importo_pagato-coalesce(d.stornato,0) remaining,'credit' direction FROM public.documenti_fiscali_elenco_operativo d
 WHERE company_id=p_company AND deleted_at IS NULL AND stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata') AND tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito')
 UNION ALL SELECT s.id,s.description,coalesce(f.name,''),s.amount-coalesce(s.paid_amount,0),'debit' FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
 WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false),
 matches AS(SELECT t.id,array_agg(c.id ORDER BY c.id) ids FROM tx t JOIN candidates c ON c.direction=t.transaction_type AND c.remaining>0 AND abs(abs(t.amount)-c.remaining)<0.005
 WHERE NOT EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL AND (old.invoice_id=c.id OR old.documento_id=c.id OR old.scadenza_id=c.id OR old.payment_source->>'documento_id'=c.id::text OR old.payment_source->>'invoice_id'=c.id::text OR old.payment_source->>'scadenza_id'=c.id::text OR EXISTS(SELECT 1 FROM public.prima_nota_entries op WHERE op.id=old.prima_nota_id AND op.company_id=p_company AND (op.documento_fiscale_id=c.id OR op.invoice_id=c.id OR op.scadenza_id=c.id)) OR EXISTS(SELECT 1 FROM public.scadenze si WHERE si.id=old.scadenza_id AND si.company_id=p_company AND si.invoice_id=c.id) OR EXISTS(SELECT 1 FROM public.movimenti_cassa_native mc WHERE mc.id=old.movimento_id AND mc.company_id=p_company AND mc.documento_id=c.id) OR EXISTS(SELECT 1 FROM public.scadenze sc WHERE sc.id=old.scadenza_id AND sc.company_id=p_company AND strpos(coalesce(sc.notes,''),'[DOC:'||c.id||']')>0))) AND ((length(regexp_replace(c.title,'[^[:alnum:]]','','g'))>=4 AND strpos(lower(regexp_replace(coalesce(t.description,''),'[^[:alnum:]]','','g')),lower(regexp_replace(c.title,'[^[:alnum:]]','','g')))>0)
 OR (length(c.party)>=4 AND strpos(lower(concat_ws(' ',t.creditor_name,t.debtor_name,t.description)),lower(c.party))>0))
 GROUP BY t.id), changed AS(UPDATE public.bank_transactions t SET proposta_controllata_at=now(),reconciliation_status=CASE WHEN m.ids IS NOT NULL THEN 'suggestion' ELSE t.reconciliation_status END,reconciliation_suggestions=coalesce(m.ids,t.reconciliation_suggestions) FROM tx scan LEFT JOIN matches m ON m.id=scan.id WHERE t.id=scan.id AND t.company_id=p_company AND t.reconciliation_status='pending' RETURNING m.ids IS NOT NULL suggested)
 SELECT count(*) FILTER(WHERE suggested) INTO n FROM changed;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bank_suggerisci_riconciliazioni(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_suggerisci_riconciliazioni(uuid) TO authenticated,service_role;


NOTIFY pgrst,'reload schema';
