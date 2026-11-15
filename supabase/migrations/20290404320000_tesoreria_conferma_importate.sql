-- Tesoreria, lotto 6 (15/11/2026): la conferma (automatica o con un clic) vale anche per gli incassi
-- di fatture IMPORTATE da un gestionale esterno (Fatture in Cloud).
-- * Riga 'invoice' a riconcilia_movimento_su_documenti, poi private.bank_record_imported: residuo
--   locale e registro delle quote importate, come la conferma in lotto (bank_conferma_lotto).
-- * Il risultato porta 'esterne' [{invoice_id, importo, provider, allinea, saldata}]: chi ha
--   confermato chiama billing-payment-push con azione «allinea_banca», che porta il pagato sul
--   gestionale al valore assoluto calcolato dal server (bank_external_payment_target): un retry non
--   somma due volte. Lo fanno il cron bank-auto-reconcile (chiamata interna) e il pulsante
--   «Conferma». Se il gestionale non risponde, il pagamento locale resta e lo si riprova.
-- * Traccia comune: a_tipo 'fattura_emessa' per le importate.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION private.tes_conferma_una(p_company uuid,p_tx uuid,p_nature text[],p_modo text DEFAULT 'auto') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE res jsonb; cd jsonb; righe jsonb:='[]'; r jsonb; somma numeric; t public.bank_transactions; out jsonb; leg uuid; traccia jsonb:='[]'; riga jsonb;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 IF t.chiuso_senza_documento IS NOT NULL THEN RETURN NULL; END IF;  -- p.es. l'altra gamba di un giroconto appena chiuso
 IF EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=p_tx AND e.scartato_at IS NOT NULL) THEN RETURN NULL; END IF;
 res:=private.tes_classifica(p_company,p_tx);
 IF res->>'esito'<>'automatico' OR NOT (res->>'natura'=ANY(p_nature)) OR jsonb_array_length(res->'candidati')<>1 THEN RETURN NULL; END IF;
 cd:=res->'candidati'->0;
 IF cd->>'forza'<>'forte' OR jsonb_array_length(cd->'conflitti')>0 THEN RETURN NULL; END IF;
 SELECT sum((x->>'quota')::numeric) INTO somma FROM jsonb_array_elements(cd->'righe') x;
 IF res->>'natura'='documento' THEN
  IF NOT t.transaction_type='credit' THEN RETURN NULL; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(cd->'righe') LOOP
   -- nativa → 'documento'; importata da un gestionale esterno → 'invoice' (poi il write-back)
   IF r->>'tipo'<>'documento' THEN RETURN NULL; END IF;
   IF EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=(r->>'id')::uuid AND d.company_id=p_company) THEN
    righe:=righe||jsonb_build_array(jsonb_build_object('tipo','documento','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
   ELSIF EXISTS(SELECT 1 FROM public.invoices iv WHERE iv.id=(r->>'id')::uuid AND iv.company_id=p_company AND iv.deleted_at IS NULL) THEN
    righe:=righe||jsonb_build_array(jsonb_build_object('tipo','invoice','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
   ELSE RETURN NULL;
   END IF;
  END LOOP;
  out:=public.bank_conferma_ripartizione(p_company,p_tx,righe,CASE WHEN p_modo='clic' THEN 'Conferma con un clic · ' ELSE 'Conferma automatica · ' END||(res->>'regola')||'/v'||(res->>'versione'));
  IF (out->>'resto')::numeric>0.005 THEN RAISE EXCEPTION 'La conferma lascerebbe un resto: non è un caso automatico'; END IF;
  -- Fatture importate: residuo locale e registro delle quote come nella conferma in lotto; il
  -- gestionale esterno si allinea dopo, col valore assoluto del server (idempotente).
  out:=private.bank_record_imported(p_company,p_tx,out);
 ELSIF res->>'natura'='giroconto' THEN
  leg:=(cd->'righe'->0->>'id')::uuid;
  PERFORM 1 FROM public.bank_transactions WHERE id=leg AND company_id=p_company FOR UPDATE;
  PERFORM public.chiudi_movimento_senza_fattura(p_tx,'nessun_costo','Giroconto','Giroconto con il movimento '||leg::text);
  IF EXISTS(SELECT 1 FROM public.bank_transactions WHERE id=leg AND chiuso_senza_documento IS NULL) THEN
   PERFORM public.chiudi_movimento_senza_fattura(leg,'nessun_costo','Giroconto','Giroconto con il movimento '||p_tx::text);
  END IF;
  out:=jsonb_build_object('giroconto_con',leg);
 ELSE RETURN NULL;
 END IF;
 -- Traccia comune dei collegamenti (acquisti_collegamenti): solo DOPO la conferma vera, così il
 -- popup comune non mostra mai un «collegato» senza il pagamento registrato. Se chi conferma non
 -- può scrivere nella traccia (permesso acquisti), la conferma resta valida e lo si annota.
 FOR riga IN SELECT value FROM jsonb_array_elements(cd->'righe') LOOP
  BEGIN
   traccia:=traccia||jsonb_build_array(jsonb_build_object('id',public.acquisti_collegamento_registra(
     p_company,'movimento_banca',p_tx,NULL,
     CASE WHEN res->>'natura'='giroconto' THEN 'movimento_banca'
          WHEN EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=(riga->>'id')::uuid AND d.company_id=p_company) THEN 'documento_fiscale'
          ELSE 'fattura_emessa' END,(riga->>'id')::uuid,NULL,
     'tesoreria:'||(res->>'regola'),CASE WHEN p_modo='clic' THEN 'manuale' ELSE 'automatico' END,
     private.tes_prove_comuni(cd->'motivi'),jsonb_build_array(jsonb_build_object('regola',res->>'regola','natura',res->>'natura')),
     NULL,NULL,(riga->>'quota')::numeric,(res->>'versione')::int,false,NULL)));
  EXCEPTION WHEN OTHERS THEN
   traccia:=traccia||jsonb_build_array(jsonb_build_object('non_registrato',SQLERRM));
  END;
 END LOOP;
 -- now() è l'inizio di questa transazione: si marcano solo le quote appena create.
 UPDATE public.bank_reconciliations SET match_type=CASE WHEN p_modo='clic' THEN 'manual' ELSE 'auto' END WHERE transaction_id=p_tx AND company_id=p_company AND unmatched_at IS NULL AND matched_at=now();
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,md5(res::text),jsonb_build_object('conferma',out,'righe',cd->'righe','motivi',cd->'motivi','traccia',traccia),CASE WHEN p_modo='clic' THEN 'confermato_clic' ELSE 'confermato_auto' END,auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
 RETURN jsonb_build_object('transaction_id',p_tx,'natura',res->>'natura','importo',somma)
  ||CASE WHEN jsonb_array_length(coalesce(out->'esterne','[]'::jsonb))>0 THEN jsonb_build_object('esterne',out->'esterne') ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION private.tes_conferma_una(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
