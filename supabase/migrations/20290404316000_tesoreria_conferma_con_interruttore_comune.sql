-- Tesoreria: la conferma automatica legge l'interruttore comune del collegamento automatico
-- (company_governance_settings.collegamento_automatico, migrazione 20290404240000 della sessione
-- Acquisti; spento di base). Regola del titolare, uguale per tutti i collegamenti:
-- * acceso: l'esito «unico e verificato» (esito `automatico`) si collega da solo;
-- * spento: lo stesso esito resta una proposta, confermata con un clic (tesoreria_conferma_esito);
-- * gli altri esiti non cambiano.
-- Per conto di chi: se il giro lo lancia una persona, a suo nome e coi suoi permessi; se lo lancia
-- il cron (servizio), a nome del titolare dell'azienda (companies.titolare_user_id), coi suoi
-- permessi. Senza titolare o senza permesso il giro si ferma e lo dice.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- La conferma di un singolo esito sa se è automatica o fatta con un clic (marcatura e storia).
DROP FUNCTION IF EXISTS private.tes_conferma_una(uuid,uuid,text[]);
CREATE OR REPLACE FUNCTION private.tes_conferma_una(p_company uuid,p_tx uuid,p_nature text[],p_modo text DEFAULT 'auto') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE res jsonb; cd jsonb; righe jsonb:='[]'; r jsonb; somma numeric; t public.bank_transactions; out jsonb; leg uuid;
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
 -- now() è l'inizio di questa transazione: si marcano solo le quote appena create.
 UPDATE public.bank_reconciliations SET match_type=CASE WHEN p_modo='clic' THEN 'manual' ELSE 'auto' END WHERE transaction_id=p_tx AND company_id=p_company AND unmatched_at IS NULL AND matched_at=now();
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,md5(res::text),jsonb_build_object('conferma',out,'righe',cd->'righe','motivi',cd->'motivi'),CASE WHEN p_modo='clic' THEN 'confermato_clic' ELSE 'confermato_auto' END,auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
 RETURN jsonb_build_object('transaction_id',p_tx,'natura',res->>'natura','importo',somma);
END $$;
REVOKE ALL ON FUNCTION private.tes_conferma_una(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid,p_limite int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE servizio boolean:=coalesce(auth.role(),'')='service_role'; chi uuid; r record; esito jsonb; confermati jsonb:='[]'; errori jsonb:='[]';
 old_claims text; old_sub text; old_role text; n int:=0;
BEGIN
 IF NOT servizio THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 IF NOT coalesce(public.azienda_collegamento_automatico(p_company),false) THEN
  RETURN jsonb_build_object('attiva',false,'motivo','Collegamento automatico spento: gli esiti «unico e verificato» restano proposte da confermare con un clic','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END IF;
 chi:=CASE WHEN servizio THEN (SELECT c.titolare_user_id FROM public.companies c WHERE c.id=p_company) ELSE auth.uid() END;
 IF chi IS NULL THEN
  RETURN jsonb_build_object('attiva',true,'fermata','L''azienda non ha un titolare indicato: le conferme automatiche aspettano chi apre la tesoreria','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 old_claims:=current_setting('request.jwt.claims',true); old_sub:=current_setting('request.jwt.claim.sub',true); old_role:=current_setting('request.jwt.claim.role',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',chi,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',chi::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN
  PERFORM private.bank_operativa_access(p_company,true);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
  RETURN jsonb_build_object('attiva',true,'fermata','Il titolare non ha il permesso di riconciliare i movimenti: conferme sospese','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END;
 FOR r IN SELECT e.transaction_id FROM public.tesoreria_esiti e JOIN public.bank_transactions t ON t.id=e.transaction_id
   WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura IN('documento','giroconto') AND e.scartato_at IS NULL
    AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion')
   ORDER BY t.booking_date,t.id LIMIT least(greatest(coalesce(p_limite,50),1),200)
 LOOP
  n:=n+1;
  BEGIN
   esito:=private.tes_conferma_una(p_company,r.transaction_id,ARRAY['documento','giroconto']);
   IF esito IS NOT NULL THEN confermati:=confermati||jsonb_build_array(esito); END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.transaction_id,'errore',SQLERRM));
   INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
   SELECT p_company,e.transaction_id,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('errore',SQLERRM),'errore_auto',chi
   FROM public.tesoreria_esiti e WHERE e.transaction_id=r.transaction_id
   ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),risultato=EXCLUDED.risultato;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN jsonb_build_object('attiva',true,'per_conto_di',chi,'esaminati',n,'confermati',confermati,'errori',errori);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) TO authenticated,service_role;

-- Conferma con un clic di un esito «unico e verificato», a nome di chi clicca. Se nel frattempo
-- l'esito non è più «unico e verificato» rifiuta: il movimento va visto a mano.
CREATE OR REPLACE FUNCTION public.tesoreria_conferma_esito(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE esito jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 esito:=private.tes_conferma_una(p_company,p_tx,ARRAY['documento','giroconto'],'clic');
 IF esito IS NULL THEN RAISE EXCEPTION 'Il movimento non ha più un esito «unico e verificato»: aprilo e collegalo a mano' USING ERRCODE='P0002'; END IF;
 RETURN esito;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_esito(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_esito(uuid,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
