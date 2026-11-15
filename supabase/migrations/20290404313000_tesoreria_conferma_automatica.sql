-- Tesoreria: conferma automatica degli esiti «automatico», per azienda (15/11/2026).
-- Decisione del titolare: sì, per ora solo su Demo Azienda 2 (si accende con
-- tesoreria_imposta_conferma_automatica, non da questa migrazione).
--
-- Regole:
-- * si conferma solo un esito ricalcolato al momento (non quello registrato) che sia
--   «automatico», di una natura ammessa dall'azienda, con un solo candidato «forte» la cui
--   somma è esattamente il residuo del movimento; un esito scartato non si conferma mai;
-- * nature ammesse: 'documento' (incasso di una fattura emessa NATIVA: quelle importate hanno
--   il write-back verso il gestionale esterno, che resta all'interfaccia) e 'giroconto';
-- * la conferma passa dalle funzioni di sempre (riconcilia_movimento_su_documenti,
--   chiudi_movimento_senza_fattura) PER CONTO della persona che ha acceso l'interruttore:
--   valgono i suoi permessi; se li perde, le conferme si fermano e resta scritto perché;
-- * un movimento che fallisce non ferma gli altri; ogni conferma e ogni errore restano nella
--   storia dell'esito; le quote create sono marcate match_type='auto'.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.tesoreria_conferma_automatica(
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 attiva boolean NOT NULL DEFAULT false,
 nature text[] NOT NULL DEFAULT ARRAY['documento','giroconto'],
 per_conto_di uuid NOT NULL,
 aggiornata_da uuid,
 aggiornata_at timestamptz NOT NULL DEFAULT now(),
 CHECK (nature <@ ARRAY['documento','giroconto'])
);
ALTER TABLE public.tesoreria_conferma_automatica ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_conferma_automatica FROM PUBLIC,anon,authenticated;

-- Accende o spegne. Chi accende deve poter riconciliare: le conferme useranno i suoi permessi.
-- Il servizio (titolare della piattaforma) indica a chi intestarle con p_per_conto_di.
CREATE OR REPLACE FUNCTION public.tesoreria_imposta_conferma_automatica(p_company uuid,p_attiva boolean,p_nature text[] DEFAULT ARRAY['documento','giroconto'],p_per_conto_di uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE chi uuid;
BEGIN
 IF coalesce(auth.role(),'')='service_role' THEN
  chi:=p_per_conto_di;
  IF chi IS NULL THEN RAISE EXCEPTION 'Indica per conto di chi gireranno le conferme' USING ERRCODE='22023'; END IF;
 ELSE
  PERFORM private.bank_operativa_access(p_company,true);
  IF NOT coalesce(public.e_amministratore_di(p_company),false) THEN RAISE EXCEPTION 'Solo un amministratore dell''azienda può cambiare la conferma automatica' USING ERRCODE='42501'; END IF;
  chi:=auth.uid();
 END IF;
 IF NOT coalesce(public.has_permission_for_company(chi,'can_reconcile_bank_transactions',p_company),false) THEN
  RAISE EXCEPTION 'Questa persona non può riconciliare i movimenti di questa azienda' USING ERRCODE='42501';
 END IF;
 IF p_nature IS NULL OR cardinality(p_nature)=0 OR NOT (p_nature <@ ARRAY['documento','giroconto']) THEN
  RAISE EXCEPTION 'Nature ammesse: documento, giroconto' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.tesoreria_conferma_automatica(company_id,attiva,nature,per_conto_di,aggiornata_da,aggiornata_at)
 VALUES(p_company,coalesce(p_attiva,false),p_nature,chi,auth.uid(),now())
 ON CONFLICT(company_id) DO UPDATE SET attiva=EXCLUDED.attiva,nature=EXCLUDED.nature,per_conto_di=EXCLUDED.per_conto_di,aggiornata_da=EXCLUDED.aggiornata_da,aggiornata_at=now();
 RETURN jsonb_build_object('attiva',coalesce(p_attiva,false),'nature',p_nature,'per_conto_di',chi);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_imposta_conferma_automatica(uuid,boolean,text[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_imposta_conferma_automatica(uuid,boolean,text[],uuid) TO authenticated,service_role;

-- Una conferma, già sotto l'identità di chi l'ha autorizzata. Rilancia in caso di errore.
CREATE OR REPLACE FUNCTION private.tes_conferma_una(p_company uuid,p_tx uuid,p_nature text[]) RETURNS jsonb
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
  out:=public.bank_conferma_ripartizione(p_company,p_tx,righe,'Conferma automatica · '||(res->>'regola')||'/v'||(res->>'versione'));
  IF (out->>'resto')::numeric>0.005 THEN RAISE EXCEPTION 'La conferma lascerebbe un resto: non è un caso automatico'; END IF;
 ELSIF res->>'natura'='giroconto' THEN
  leg:=(cd->'righe'->0->>'id')::uuid;
  PERFORM 1 FROM public.bank_transactions WHERE id=leg AND company_id=p_company FOR UPDATE;
  PERFORM public.chiudi_movimento_senza_fattura(p_tx,'nessun_costo','Giroconto','Giroconto automatico con il movimento '||leg::text);
  IF EXISTS(SELECT 1 FROM public.bank_transactions WHERE id=leg AND chiuso_senza_documento IS NULL) THEN
   PERFORM public.chiudi_movimento_senza_fattura(leg,'nessun_costo','Giroconto','Giroconto automatico con il movimento '||p_tx::text);
  END IF;
  out:=jsonb_build_object('giroconto_con',leg);
 ELSE RETURN NULL;
 END IF;
 -- now() è l'inizio di questa transazione: si marcano solo le quote appena create.
 UPDATE public.bank_reconciliations SET match_type='auto' WHERE transaction_id=p_tx AND company_id=p_company AND unmatched_at IS NULL AND matched_at=now();
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,md5(res::text),jsonb_build_object('conferma',out,'righe',cd->'righe','motivi',cd->'motivi'),'confermato_auto',auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
 RETURN jsonb_build_object('transaction_id',p_tx,'natura',res->>'natura','importo',somma);
END $$;
REVOKE ALL ON FUNCTION private.tes_conferma_una(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated;

-- Il giro: per le aziende con l'interruttore acceso, conferma gli esiti automatici.
CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid,p_limite int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.tesoreria_conferma_automatica; r record; esito jsonb; confermati jsonb:='[]'; errori jsonb:='[]';
 old_claims text; old_sub text; old_role text; n int:=0;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 SELECT * INTO cfg FROM public.tesoreria_conferma_automatica WHERE company_id=p_company AND attiva;
 IF NOT FOUND THEN RETURN jsonb_build_object('attiva',false,'confermati','[]'::jsonb,'errori','[]'::jsonb); END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 old_claims:=current_setting('request.jwt.claims',true); old_sub:=current_setting('request.jwt.claim.sub',true); old_role:=current_setting('request.jwt.claim.role',true);
 -- Da qui in poi è la persona che ha acceso l'interruttore: i suoi permessi, il suo nome sulle quote.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',cfg.per_conto_di,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',cfg.per_conto_di::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN
  PERFORM private.bank_operativa_access(p_company,true);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
  RETURN jsonb_build_object('attiva',true,'fermata','La persona indicata non ha più il permesso di riconciliare: conferme sospese','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END;
 FOR r IN SELECT e.transaction_id FROM public.tesoreria_esiti e JOIN public.bank_transactions t ON t.id=e.transaction_id
   WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura=ANY(cfg.nature) AND e.scartato_at IS NULL
    AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion')
   ORDER BY t.booking_date,t.id LIMIT least(greatest(coalesce(p_limite,50),1),200)
 LOOP
  n:=n+1;
  BEGIN
   esito:=private.tes_conferma_una(p_company,r.transaction_id,cfg.nature);
   IF esito IS NOT NULL THEN confermati:=confermati||jsonb_build_array(esito); END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.transaction_id,'errore',SQLERRM));
   INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
   SELECT p_company,e.transaction_id,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('errore',SQLERRM),'errore_auto',cfg.per_conto_di
   FROM public.tesoreria_esiti e WHERE e.transaction_id=r.transaction_id
   ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),risultato=EXCLUDED.risultato;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN jsonb_build_object('attiva',true,'esaminati',n,'confermati',confermati,'errori',errori);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
