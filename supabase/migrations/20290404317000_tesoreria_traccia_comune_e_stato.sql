-- Tesoreria nella traccia comune e nella sezione Impostazioni → Automazioni (15/11/2026).
-- * Ogni conferma vera (automatica o con un clic) si registra anche in acquisti_collegamenti con
--   acquisti_collegamento_registra: movimento_banca → documento_fiscale (incasso) o
--   movimento_banca → movimento_banca (giroconto), con importo, regola «tesoreria:R-…», prove nel
--   formato comune. Mai prima della conferma: il popup comune non deve mostrare un «collegato»
--   senza il pagamento registrato. Se la traccia rifiuta (permesso acquisti), la conferma resta.
-- * tesoreria_stato_automatismo(azienda): quanti esiti «unico e verificato» aspettano e l'ultima
--   conferma o errore, per la riga «Incassi e giroconti dalla banca».
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- I motivi del motore come prove della traccia comune: ruolo, non peso.
CREATE OR REPLACE FUNCTION private.tes_prove_comuni(p_motivi jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'campo',CASE WHEN m ILIKE '%IBAN%' OR m ILIKE '%conto dell%' THEN 'iban' WHEN m ILIKE 'Numero%' THEN 'numero_documento'
                WHEN m ILIKE 'Importo%' OR m ILIKE 'Stesso importo%' THEN 'importo' WHEN m ILIKE 'Data%' THEN 'data'
                WHEN m ILIKE '%rapporto documentato%' THEN 'pagante' ELSE 'controparte' END,
   'ruolo',CASE WHEN m ILIKE '%IBAN verificato%' OR m ILIKE '%conto dell%' OR m ILIKE 'Numero%' OR m ILIKE '%rapporto documentato%' THEN 'identifica'
                WHEN m ILIKE 'Data%' THEN 'indizio' ELSE 'conferma' END,
   'esito','uguale','testo',m) ORDER BY o),'[]'::jsonb)
 FROM jsonb_array_elements_text(coalesce(p_motivi,'[]'::jsonb)) WITH ORDINALITY x(m,o)
$$;
REVOKE ALL ON FUNCTION private.tes_prove_comuni(jsonb) FROM PUBLIC,anon,authenticated;

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
   -- solo fatture native: le importate passano dal write-back dell'interfaccia
   IF r->>'tipo'<>'documento' OR NOT EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=(r->>'id')::uuid AND d.company_id=p_company) THEN RETURN NULL; END IF;
   righe:=righe||jsonb_build_array(jsonb_build_object('tipo','documento','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
  END LOOP;
  out:=public.bank_conferma_ripartizione(p_company,p_tx,righe,CASE WHEN p_modo='clic' THEN 'Conferma con un clic · ' ELSE 'Conferma automatica · ' END||(res->>'regola')||'/v'||(res->>'versione'));
  IF (out->>'resto')::numeric>0.005 THEN RAISE EXCEPTION 'La conferma lascerebbe un resto: non è un caso automatico'; END IF;
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
     CASE WHEN res->>'natura'='giroconto' THEN 'movimento_banca' ELSE 'documento_fiscale' END,(riga->>'id')::uuid,NULL,
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
 RETURN jsonb_build_object('transaction_id',p_tx,'natura',res->>'natura','importo',somma);
END $$;
REVOKE ALL ON FUNCTION private.tes_conferma_una(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;

-- Per la riga «Incassi e giroconti dalla banca» in Impostazioni → Automazioni. Chi non vede la
-- tesoreria riceve null (la riga dice «nessun esito»), non un errore.
CREATE OR REPLACE FUNCTION public.tesoreria_stato_automatismo(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ultima record; errore record; attesa int;
BEGIN
 BEGIN
  PERFORM private.bank_operativa_access(p_company,false);
 EXCEPTION WHEN OTHERS THEN RETURN NULL;
 END;
 SELECT count(*) INTO attesa FROM public.tesoreria_esiti e JOIN public.bank_transactions t ON t.id=e.transaction_id
 WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura IN('documento','giroconto') AND e.scartato_at IS NULL
  AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion');
 SELECT s.il,s.evento INTO ultima FROM public.tesoreria_esiti_storia s WHERE s.company_id=p_company AND s.evento IN('confermato_auto','confermato_clic') ORDER BY s.il DESC LIMIT 1;
 SELECT s.il,s.risultato->>'errore' errore INTO errore FROM public.tesoreria_esiti_storia s WHERE s.company_id=p_company AND s.evento='errore_auto' ORDER BY s.il DESC LIMIT 1;
 RETURN jsonb_build_object('in_attesa',attesa,'ultima_conferma_il',ultima.il,'ultima_conferma',ultima.evento,
  'ultimo_errore_il',CASE WHEN errore.il>coalesce(ultima.il,'-infinity'::timestamptz) THEN errore.il END,
  'ultimo_errore',CASE WHEN errore.il>coalesce(ultima.il,'-infinity'::timestamptz) THEN errore.errore END);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_stato_automatismo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_stato_automatismo(uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
