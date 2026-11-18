-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: la banca senza fattura si chiude da sola ogni notte, con costo e
-- prima nota come farebbe la contabilità (18/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Su Impresa Vulcano il 18/11 sono stati chiusi a mano 231 movimenti senza
-- fattura: commissioni, bolli, interessi, F24, stipendi, rate di mutuo e
-- prestito, anticipi su fatture. Ogni mese ne arrivano altrettanti. Qui la
-- stessa procedura diventa un passo del giro notturno (tesoreria_conferma_automatica),
-- dopo le conferme automatiche, solo dove company_governance_settings.
-- chiusura_senza_fattura_automatica è acceso (20290419150000, spento per tutti).
--
-- 1. cassa_regole_applica: le regole della pagina «Regole» danno la voce di cassa.
-- 2. private.tes_chiudi_senza_fattura chiude i movimenti con una voce senza fattura:
--    • costi bancari (13.03-13.10, 12.09 bolli, 31.01-31.02): chiudi_movimento_senza_fattura
--      'spesa' → costo («interessi», «tasse», «spese bancarie») e prima nota collegata alla banca.
--      Se la stessa uscita è già nella prima nota (importata: stesso importo, ±3 giorni,
--      senza banca), si chiude senza costo e senza riga nuova: niente doppioni.
--    • rata di mutuo (17.01) o prestito (17.02): capitale e interessi letti dalla causale
--      («Cap.: … Int.: …», «Quota capitale … Interessi …»); ripartizione su due voci,
--      interessi a costo, prima nota per entrambe le quote. Se la causale non si legge, resta aperta.
--    • tributi (12.*), stipendi (06.01), anticipi (16.04) e loro rimborsi (17.04):
--      chiusi senza costo, con la riga di prima nota (fiscale, stipendi, finanziamento).
--    Un movimento già riconciliato, collegato, con prima nota o diviso a mano non si tocca.
--
-- Idempotente: CREATE OR REPLACE. tesoreria_conferma_automatica è il testo vivo con
-- le sole righe marcate «18/11/2026».
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.tes_chiudi_senza_fattura(p_company uuid, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 r record; pn uuid; usati uuid[]:='{}'; cap numeric; intr numeric; spese numeric; cst uuid; cat text; rev int;
 vcap uuid; vint uuid; vsp uuid; n_costi int:=0; n_gia int:=0; n_chiusi int:=0; n_rate int:=0; n_saltati int:=0; errori jsonb:='[]';
 costi_banca constant text[]:=ARRAY['13.03','13.06','13.07','13.08','13.09','13.10','12.09','31.01','31.02'];
BEGIN
 IF NOT coalesce((SELECT g.chiusura_senza_fattura_automatica FROM public.company_governance_settings g WHERE g.company_id=p_company),false) THEN
  RETURN jsonb_build_object('attiva',false);
 END IF;
 FOR r IN
  SELECT t.id, t.amount, t.booking_date, t.description, t.operativita_revision rev, v.codice, v.nome
    FROM public.bank_transactions t JOIN public.cassa_voci v ON v.id=t.cassa_voce_id AND v.company_id=t.company_id
   WHERE t.company_id=p_company AND coalesce(t.status,'booked')='booked' AND coalesce(t.currency,'EUR')='EUR'
     AND coalesce(t.reconciliation_status,'pending') NOT IN('reconciled','ignored','parziale') AND t.chiuso_senza_documento IS NULL
     AND t.cassa_ripartizione IS NULL
     AND t.linked_invoice_id IS NULL AND t.linked_cost_id IS NULL AND t.linked_scadenza_id IS NULL AND t.linked_installment_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations x WHERE x.transaction_id=t.id AND x.unmatched_at IS NULL)
     AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.bank_transaction_id=t.id)
     AND (v.codice=ANY(costi_banca) OR v.codice IN('17.01','17.02','17.04','16.04','06.01') OR v.codice LIKE '12.%')
   ORDER BY t.booking_date, t.id
   LIMIT greatest(coalesce(p_limite,200),1)
 LOOP
  BEGIN
   IF r.codice=ANY(costi_banca) AND r.amount<0 THEN
    cat:=CASE WHEN r.codice IN('13.03','13.05') THEN 'interessi' WHEN r.codice='12.09' THEN 'tasse' ELSE 'spese bancarie' END;
    SELECT p.id INTO pn FROM public.prima_nota_entries p
     WHERE p.company_id=p_company AND p.bank_transaction_id IS NULL AND p.direction='uscita' AND abs(p.amount-abs(r.amount))<0.005
       AND abs(p.entry_date-r.booking_date)<=3 AND NOT (p.id=ANY(usati))
     ORDER BY abs(p.entry_date-r.booking_date), p.id LIMIT 1;
    IF pn IS NOT NULL THEN
     usati:=usati||pn;
     PERFORM public.chiudi_movimento_senza_fattura(r.id,'nessun_costo',r.nome,'Già nella prima nota: non si registra di nuovo');
     n_gia:=n_gia+1;
    ELSE
     PERFORM public.chiudi_movimento_senza_fattura(r.id,'spesa',r.nome,
       left(regexp_replace(r.description,'\s+',' ','g'),185)||' · '||left(r.id::text,8),cat);
     n_costi:=n_costi+1;
    END IF;
   ELSIF r.codice IN('17.01','17.02') AND r.amount<0 THEN
    IF r.codice='17.01' THEN
     cap:=replace(replace(substring(r.description FROM 'Cap\.: *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
     intr:=replace(replace(substring(r.description FROM 'Int\.: *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
    ELSE
     cap:=replace(replace(substring(r.description FROM 'Quota capitale *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
     intr:=replace(replace(substring(r.description FROM 'Interessi *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
    END IF;
    spese:=round(abs(r.amount)-coalesce(cap,0)-coalesce(intr,0),2);
    IF cap IS NULL OR intr IS NULL OR spese<0 OR spese>50 THEN n_saltati:=n_saltati+1; CONTINUE; END IF;
    SELECT id INTO vcap FROM public.cassa_voci WHERE company_id=p_company AND codice=r.codice;
    SELECT id INTO vint FROM public.cassa_voci WHERE company_id=p_company AND codice=CASE r.codice WHEN '17.01' THEN '13.01' ELSE '13.02' END;
    SELECT id INTO vsp FROM public.cassa_voci WHERE company_id=p_company AND codice='13.09';
    rev:=public.bank_movimento_ripartizione(p_company,r.id,
      jsonb_build_array(jsonb_build_object('voce',vcap,'cents',round(cap*100)::bigint),jsonb_build_object('voce',vint,'cents',round(intr*100)::bigint))
      ||CASE WHEN spese>0.004 THEN jsonb_build_array(jsonb_build_object('voce',vsp,'cents',round(spese*100)::bigint)) ELSE '[]'::jsonb END,
      r.rev,'Rata di finanziamento: capitale e interessi dalla causale');
    PERFORM public.chiudi_movimento_senza_fattura(r.id,'nessun_costo',CASE r.codice WHEN '17.01' THEN 'Rata mutuo' ELSE 'Rata prestito' END,
      format('Capitale %s €, interessi %s €, spese %s €',cap,intr,spese));
    INSERT INTO public.company_costs(company_id,name,amount,vat_rate,cost_type,recurrence,category,senza_fattura,due_date,documento_data,mese_competenza,
      is_paid,paid_date,payment_method,notes)
     VALUES(p_company,left(format('Interessi %s · rata del %s',CASE r.codice WHEN '17.01' THEN 'mutuo' ELSE 'prestito' END,to_char(r.booking_date,'DD/MM/YYYY')),200),
      round(intr+spese,2),0,'variable','once','interessi',true,r.booking_date,r.booking_date,date_trunc('month',r.booking_date)::date,
      true,r.booking_date,'rid','[RATA:'||r.id::text||']')
     RETURNING id INTO cst;
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,cost_id,is_auto,auto_source,reconciliation_method,bank_transaction_id,created_by)
     VALUES(p_company,'uscita','finanziamento',left('Quota capitale · '||regexp_replace(r.description,'\s+',' ','g'),300),cap,r.booking_date,'rid',NULL,true,'banca_senza_documento','generic_categorized',r.id,auth.uid()),
           (p_company,'uscita','fornitore',left('Interessi e spese · '||regexp_replace(r.description,'\s+',' ','g'),300),round(intr+spese,2),r.booking_date,'rid',cst,true,'banca_senza_documento','generic_categorized',r.id,auth.uid());
    n_rate:=n_rate+1;
   ELSIF (r.codice LIKE '12.%' AND r.codice<>'12.09') OR r.codice IN('06.01','16.04','17.04') THEN
    PERFORM public.chiudi_movimento_senza_fattura(r.id,'nessun_costo',r.nome,left(regexp_replace(r.description,'\s+',' ','g'),200));
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,is_auto,auto_source,reconciliation_method,bank_transaction_id,created_by)
     VALUES(p_company,CASE WHEN r.amount<0 THEN 'uscita' ELSE 'entrata' END,
      CASE WHEN r.codice LIKE '12.%' THEN 'fiscale' WHEN r.codice='06.01' THEN 'stipendi' ELSE 'finanziamento' END,
      left(regexp_replace(r.description,'\s+',' ','g'),300),abs(r.amount),r.booking_date,'bonifico',true,'banca_senza_documento','generic_categorized',r.id,auth.uid());
    n_chiusi:=n_chiusi+1;
   ELSE
    n_saltati:=n_saltati+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.id,'voce',r.codice,'errore',SQLERRM));
  END;
 END LOOP;
 RETURN jsonb_build_object('attiva',true,'costi',n_costi,'gia_in_prima_nota',n_gia,'senza_costo',n_chiusi,'rate',n_rate,'saltati',n_saltati,'errori',errori);
END $function$;

REVOKE ALL ON FUNCTION private.tes_chiudi_senza_fattura(uuid,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE servizio boolean:=coalesce(auth.role(),'')='service_role'; chi uuid; r record; esito jsonb; confermati jsonb:='[]'; errori jsonb:='[]'; senza_fattura jsonb;
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
   WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura IN('documento','giroconto','gia_pagata','gia_incassata') AND e.scartato_at IS NULL
    AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion')
   ORDER BY t.booking_date,t.id LIMIT least(greatest(coalesce(p_limite,50),1),200)
 LOOP
  n:=n+1;
  BEGIN
   esito:=private.tes_conferma_una(p_company,r.transaction_id,ARRAY['documento','giroconto','gia_pagata','gia_incassata']);
   IF esito IS NOT NULL THEN confermati:=confermati||jsonb_build_array(esito); END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.transaction_id,'errore',SQLERRM));
   INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
   SELECT p_company,e.transaction_id,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('errore',SQLERRM),'errore_auto',chi
   FROM public.tesoreria_esiti e WHERE e.transaction_id=r.transaction_id
   ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),risultato=EXCLUDED.risultato;
  END;
 END LOOP;
 -- 18/11/2026: dove l'azienda l'ha acceso, le regole di cassa danno la voce ai movimenti nuovi e la banca
 -- senza fattura si chiude (costi bancari con costo e prima nota; tributi, stipendi, rate, anticipi con
 -- sola prima nota). Un errore qui non annulla le conferme già fatte.
 BEGIN
  IF coalesce((SELECT g.chiusura_senza_fattura_automatica FROM public.company_governance_settings g WHERE g.company_id=p_company),false) THEN
   senza_fattura:=jsonb_build_object('regole',public.cassa_regole_applica(p_company,false)->'aggiornati')
                  ||private.tes_chiudi_senza_fattura(p_company,200);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  senza_fattura:=jsonb_build_object('errore',SQLERRM);
 END;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN jsonb_build_object('attiva',true,'per_conto_di',chi,'esaminati',n,'confermati',confermati,'errori',errori)
  ||CASE WHEN senza_fattura IS NOT NULL THEN jsonb_build_object('senza_fattura',senza_fattura) ELSE '{}'::jsonb END;
END $function$;
