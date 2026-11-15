-- Tesoreria (15/11/2026): «Ricorda questo IBAN» dal Dettaglio movimento.
-- La schermata conosce la quota (bank_reconciliations.id), non la fattura: la nuova funzione
-- risale alla fattura dalla quota stessa (documento, movimento di cassa o fattura importata).
-- tesoreria_ricorda_iban_cliente riconosce ora anche il collegamento a una fattura importata
-- (bank_reconciliations.invoice_id), che prima rifiutava con «Prima collega l'incasso».
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.tesoreria_ricorda_iban_cliente(p_company uuid,p_tx uuid,p_documento uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions; v_iban text; v_chiave text; v_nome text; sid uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND OR t.transaction_type<>'credit' THEN RAISE EXCEPTION 'Serve un incasso di questa azienda' USING ERRCODE='22023'; END IF;
 v_iban:=private.tes_iban(coalesce(t.debtor_iban,to_jsonb(t)->>'counterparty_iban'));
 IF v_iban IS NULL THEN RAISE EXCEPTION 'La banca non ha comunicato l''IBAN dell''ordinante' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r LEFT JOIN public.movimenti_cassa_native m ON m.id=r.movimento_id AND m.company_id=r.company_id
     WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.unmatched_at IS NULL AND p_documento IN(r.documento_id,m.documento_id,r.invoice_id)) THEN
  RAISE EXCEPTION 'Prima collega l''incasso alla fattura: l''IBAN si conferma su un collegamento già fatto' USING ERRCODE='22023';
 END IF;
 SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva',''),nullif(d.cliente_snapshot->>'codice_fiscale',''))),
        coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),''))
   INTO v_chiave,v_nome FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=p_documento AND d.company_id=p_company;
 IF length(coalesce(v_chiave,''))<8 THEN RAISE EXCEPTION 'La fattura non ha la partita IVA o il codice fiscale del cliente' USING ERRCODE='22023'; END IF;
 INSERT INTO public.tesoreria_iban_verificati(company_id,chiave_fiscale,soggetto_nome,iban,fonte_transaction_id,fonte_documento_id,confermato_da)
 VALUES(p_company,v_chiave,v_nome,v_iban,p_tx,p_documento,auth.uid())
 ON CONFLICT(company_id,chiave_fiscale,iban) WHERE revocato_at IS NULL DO NOTHING RETURNING id INTO sid;
 IF sid IS NULL THEN SELECT id INTO sid FROM public.tesoreria_iban_verificati WHERE company_id=p_company AND chiave_fiscale=v_chiave AND iban=v_iban AND revocato_at IS NULL; END IF;
 RETURN jsonb_build_object('id',sid,'cliente',v_nome,'iban',v_iban);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_ricorda_iban_da_quota(p_company uuid,p_riconciliazione uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bank_reconciliations; v_doc uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO r FROM public.bank_reconciliations WHERE id=p_riconciliazione AND company_id=p_company AND unmatched_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Collegamento non più attivo: ricarica il movimento' USING ERRCODE='P0002'; END IF;
 v_doc:=coalesce(r.documento_id,
   (SELECT m.documento_id FROM public.movimenti_cassa_native m WHERE m.id=r.movimento_id AND m.company_id=p_company),
   r.invoice_id,
   (to_jsonb(r)->'payment_source'->>'documento_id')::uuid,(to_jsonb(r)->'payment_source'->>'invoice_id')::uuid);
 IF v_doc IS NULL THEN RAISE EXCEPTION 'Questo collegamento non è su una fattura emessa' USING ERRCODE='22023'; END IF;
 RETURN public.tesoreria_ricorda_iban_cliente(p_company,r.transaction_id,v_doc);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_ricorda_iban_da_quota(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_ricorda_iban_da_quota(uuid,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
