-- Tesoreria: revisione finale dell'area C (15/11/2026). Ogni funzione toccata è ridefinita per
-- intero (nessuna sostituzione di testo): la migrazione si può rilanciare.
--  1. Lo scarto di una proposta resta legato ai candidati (scartato_chiavi): un candidato scartato non
--     si conferma mai; lo scarto si toglie solo se compare un candidato nuovo.
--  2. R-DOC è «automatico» solo se nessun altro candidato è in conflitto; la conferma rifiuta un
--     esito con conflitti.
--  3. Giro, stato e pulsante confermano solo incassi e giroconti (le uscite «automatico» non si
--     confermano da qui); R-GIRO non propone gambe già chiuse, riconciliate o con quote.
--  4. Guardia sul costo doppio: blocca il caso verificato e esatto, avvisa (senza bloccare) quando
--     il fornitore, scelto o riconosciuto dall'IBAN, ha un debito aperto ≥ importo; il controllo 3
--     li trova anche senza fornitore sulla spesa e sui pagamenti parziali.
--  5. Previsioni: a interruttore spento solo la proposta; scadenza reale annullata o cancellata →
--     la previsione torna com'era (FK SET NULL, trigger di ripristino).
--  6. Fatture importate: il motore emette riga 'invoice'; tesoreria_conferma_alternativa passa da
--     bank_record_imported.
--  7. Gestionale esterno non allineato: tesoreria_riallineo_esterno, ritentato dal cron.
--  9. tes_uuid per payment_source; IBAN della controparte anche da counterparty_iban.
-- 10. Sulle uscite il conflitto parla di beneficiario, non di pagante.
-- 11. Pagante senza doppioni (indice unico); anteprima della classificazione solo a chi riconcilia.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- ─── Aiuti e colonne ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.tes_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END
$$;
REVOKE ALL ON FUNCTION private.tes_uuid(text) FROM PUBLIC,anon,authenticated;

-- 1. I candidati scartati restano scartati, legati al candidato e non al movimento.
ALTER TABLE public.tesoreria_esiti ADD COLUMN IF NOT EXISTS scartato_chiavi text[];
UPDATE public.tesoreria_esiti e SET scartato_chiavi=ARRAY(SELECT c->>'chiave' FROM jsonb_array_elements(coalesce(e.risultato->'candidati','[]'::jsonb)) c ORDER BY 1)
 WHERE e.scartato_at IS NOT NULL AND e.scartato_chiavi IS NULL;

-- 5. Sostituzioni: proposta (interruttore spento) o applicata; la scadenza reale che sparisce
--    non si porta via la riga (SET NULL) e la previsione torna com'era.
ALTER TABLE public.scadenze_sostituzioni ADD COLUMN IF NOT EXISTS stato text NOT NULL DEFAULT 'applicata';
ALTER TABLE public.scadenze_sostituzioni DROP CONSTRAINT IF EXISTS scadenze_sostituzioni_stato_check;
ALTER TABLE public.scadenze_sostituzioni ADD CONSTRAINT scadenze_sostituzioni_stato_check CHECK (stato IN('applicata','proposta'));
ALTER TABLE public.scadenze_sostituzioni ALTER COLUMN reale_id DROP NOT NULL;
ALTER TABLE public.scadenze_sostituzioni DROP CONSTRAINT IF EXISTS scadenze_sostituzioni_reale_id_fkey;
ALTER TABLE public.scadenze_sostituzioni ADD CONSTRAINT scadenze_sostituzioni_reale_id_fkey FOREIGN KEY (reale_id) REFERENCES public.scadenze(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scadenze_sostituzioni_reale ON public.scadenze_sostituzioni(reale_id) WHERE annullato_at IS NULL;

-- 11. Un rapporto col pagante non si registra due volte.
CREATE UNIQUE INDEX IF NOT EXISTS tesoreria_paganti_autorizzati_unico ON public.tesoreria_paganti_autorizzati
 (company_id,lower(soggetto_nome),coalesce(lower(pagante_nome),''),coalesce(pagante_iban,'')) WHERE revocato_at IS NULL;

-- ─── 4. Il movimento che chiude un debito già registrato ────────────────────────────
-- Blocca quando il debito è verificato e l'importo è il residuo esatto. Avvisa, senza bloccare,
-- quando il fornitore (scelto o riconosciuto dall'IBAN del movimento) ha un debito aperto con
-- residuo ≥ importo: il controllo 3 di cdg_controllo_doppi lo segnala dopo.
CREATE OR REPLACE FUNCTION private.tes_spesa_da_banca_non_doppia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE txid uuid; t public.bank_transactions; s record; tx_iban text; causale text; imp numeric;
BEGIN
 IF NOT coalesce(NEW.senza_fattura,false) OR coalesce(NEW.notes,'')!~'^\[BANCA:[0-9a-fA-F-]{36}\]' THEN RETURN NEW; END IF;
 txid:=substring(NEW.notes FROM '^\[BANCA:([0-9a-fA-F-]{36})\]')::uuid;
 SELECT * INTO t FROM public.bank_transactions WHERE id=txid AND company_id=NEW.company_id;
 IF NOT FOUND OR to_jsonb(t)->>'proposta_rifiutata_at' IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=txid AND e.scartato_at IS NOT NULL) THEN RETURN NEW; END IF;
 tx_iban:=coalesce(private.tes_iban(t.creditor_iban),private.tes_iban(to_jsonb(t)->>'counterparty_iban'));
 causale:=concat_ws(' ',t.description,t.reference); imp:=abs(t.amount);
 SELECT sc.id,sc.description,round(sc.amount-coalesce(sc.paid_amount,0),2) residuo,
  (abs(sc.amount-coalesce(sc.paid_amount,0)-imp)<0.005 AND (
    (tx_iban IS NOT NULL AND EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=NEW.company_id AND v.fornitore_id=sc.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban))
    OR (private.tes_numero_in_causale(causale,private.tes_numero_nucleo(coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),sc.description)),
          extract(year FROM nullif(to_jsonb(cc)->>'documento_data','')::date)::int) IN('si','anno')
        AND length(coalesce(private.tes_numero_nucleo(coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),sc.description)),''))>=2))) verificato
 INTO s
 FROM public.scadenze sc LEFT JOIN public.company_costs cc ON cc.id=sc.cost_id AND cc.company_id=sc.company_id
  LEFT JOIN public.suppliers f ON f.id=sc.supplier_id AND f.company_id=sc.company_id
 WHERE sc.company_id=NEW.company_id AND sc.direction='uscita' AND sc.status IN('da_pagare','parziale') AND coalesce(sc.is_previsionale,false)=false
  AND sc.supplier_id IS NOT NULL AND sc.amount-coalesce(sc.paid_amount,0)>=imp-0.005
  AND ((NEW.supplier_id IS NOT NULL AND sc.supplier_id=NEW.supplier_id)
    OR (tx_iban IS NOT NULL AND (private.tes_iban(to_jsonb(f)->>'iban')=tx_iban
        OR EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=NEW.company_id AND v.fornitore_id=sc.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban))))
 ORDER BY 4 DESC,abs(sc.amount-coalesce(sc.paid_amount,0)-imp),sc.due_date NULLS LAST,sc.id LIMIT 1;
 IF FOUND AND s.verificato THEN
  RAISE EXCEPTION 'Questa uscita salda un debito già registrato («%», % €): collegala alla scadenza invece di registrare una spesa nuova, così il costo non si conta due volte.',s.description,s.residuo
   USING ERRCODE='23505';
 ELSIF FOUND THEN
  RAISE WARNING 'Possibile costo doppio: c''è un debito aperto dello stesso fornitore («%», residuo % €). Si vedrà in Controllo di gestione → Niente contato due volte.',s.description,s.residuo;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tes_spesa_da_banca_non_doppia() FROM PUBLIC,anon,authenticated;

-- ─── 5. Previsioni ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.tes_sostituisci_previsione(p_company uuid,p_previsione uuid,p_reale uuid,p_regola text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pv public.scadenze; re public.scadenze; coperto numeric; nuovo numeric; sid uuid; z public.scadenze_sostituzioni;
BEGIN
 SELECT * INTO pv FROM public.scadenze WHERE id=p_previsione AND company_id=p_company FOR UPDATE;
 SELECT * INTO re FROM public.scadenze WHERE id=p_reale AND company_id=p_company FOR UPDATE;
 IF pv.id IS NULL OR re.id IS NULL THEN RAISE EXCEPTION 'Scadenza non disponibile in questa azienda' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(pv.is_previsionale,false) OR coalesce(re.is_previsionale,false) THEN RAISE EXCEPTION 'Serve una previsione e una scadenza reale' USING ERRCODE='22023'; END IF;
 IF pv.direction IS DISTINCT FROM re.direction THEN RAISE EXCEPTION 'Previsione e scadenza vanno nella stessa direzione' USING ERRCODE='22023'; END IF;
 SELECT * INTO z FROM public.scadenze_sostituzioni WHERE previsione_id=p_previsione AND reale_id=p_reale AND annullato_at IS NULL FOR UPDATE;
 IF z.id IS NOT NULL AND z.stato='applicata' THEN RETURN jsonb_build_object('id',z.id,'gia_fatto',true); END IF;   -- retry
 IF pv.status NOT IN('da_pagare','parziale') THEN RAISE EXCEPTION 'La previsione non è più aperta' USING ERRCODE='22023'; END IF;
 coperto:=least(re.amount,pv.amount-coalesce(pv.paid_amount,0));
 nuovo:=pv.amount-coperto;
 IF z.id IS NOT NULL THEN   -- era una proposta: la si applica
  UPDATE public.scadenze_sostituzioni SET stato='applicata',importo_previsto_prima=pv.amount,stato_prima=pv.status,importo_coperto=coperto,regola=p_regola,created_by=coalesce(auth.uid(),created_by)
   WHERE id=z.id RETURNING id INTO sid;
 ELSE
  INSERT INTO public.scadenze_sostituzioni(company_id,previsione_id,reale_id,importo_previsto_prima,stato_prima,importo_coperto,regola,created_by,stato)
  VALUES(p_company,p_previsione,p_reale,pv.amount,pv.status,coperto,p_regola,auth.uid(),'applicata') RETURNING id INTO sid;
 END IF;
 UPDATE public.scadenze SET amount=nuovo,
  status=CASE WHEN nuovo-coalesce(paid_amount,0)<=0.005 THEN CASE WHEN coalesce(paid_amount,0)>0 THEN 'pagata' ELSE 'annullata' END ELSE status END,
  notes=concat_ws(E'\n',nullif(notes,''),format('[SOSTITUITA_DA:%s] %s € coperti dalla scadenza reale',p_reale,coperto))
 WHERE id=p_previsione;
 RETURN jsonb_build_object('id',sid,'coperto',coperto,'residuo_previsione',nuovo);
END $$;
REVOKE ALL ON FUNCTION private.tes_sostituisci_previsione(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;

-- Annulla una sostituzione: se era applicata, la previsione torna come prima.
CREATE OR REPLACE FUNCTION private.tes_annulla_sostituzione(p_id uuid,p_nota text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.scadenze_sostituzioni;
BEGIN
 UPDATE public.scadenze_sostituzioni SET annullato_at=now(),annullato_da=auth.uid() WHERE id=p_id AND annullato_at IS NULL RETURNING * INTO x;
 IF NOT FOUND OR x.stato<>'applicata' THEN RETURN; END IF;
 UPDATE public.scadenze SET amount=amount+x.importo_coperto,
  status=CASE WHEN status IN('annullata','pagata') THEN x.stato_prima ELSE status END,
  notes=concat_ws(E'\n',nullif(notes,''),format('[SOSTITUZIONE_ANNULLATA:%s] %s',coalesce(x.reale_id::text,'scadenza eliminata'),coalesce(p_nota,'')))
 WHERE id=x.previsione_id AND company_id=x.company_id;
END $$;
REVOKE ALL ON FUNCTION private.tes_annulla_sostituzione(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_annulla_sostituzione(p_company uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND (public.utente_sola_lettura(p_company) OR NOT coalesce(public.puo_gestire_scadenze(p_company),false)) THEN
  RAISE EXCEPTION 'Operazione non autorizzata' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.scadenze_sostituzioni WHERE id=p_id AND company_id=p_company AND annullato_at IS NULL) THEN
  RAISE EXCEPTION 'Sostituzione non trovata o già annullata' USING ERRCODE='P0002';
 END IF;
 PERFORM private.tes_annulla_sostituzione(p_id,'annullata a mano');
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_annulla_sostituzione(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_annulla_sostituzione(uuid,uuid) TO authenticated,service_role;

-- Scadenza reale nuova: interruttore acceso → si applica; spento → resta una proposta.
CREATE OR REPLACE FUNCTION private.tes_previsione_da_reale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; pv public.scadenze;
BEGIN
 IF coalesce(NEW.is_previsionale,false) OR NEW.supplier_id IS NULL OR NEW.status NOT IN('da_pagare','parziale','pagata') THEN RETURN NULL; END IF;
 ids:=ARRAY(SELECT p.id FROM public.scadenze p WHERE p.company_id=NEW.company_id AND coalesce(p.is_previsionale,false) AND p.status IN('da_pagare','parziale')
  AND p.direction=NEW.direction AND p.supplier_id=NEW.supplier_id AND p.order_id IS NOT DISTINCT FROM NEW.order_id LIMIT 2);
 IF coalesce(array_length(ids,1),0)<>1 THEN RETURN NULL; END IF;
 IF coalesce(public.azienda_collegamento_automatico(NEW.company_id),false) THEN
  PERFORM private.tes_sostituisci_previsione(NEW.company_id,ids[1],NEW.id,'R-PREVISIONE/v1');
 ELSE
  SELECT * INTO pv FROM public.scadenze WHERE id=ids[1];
  INSERT INTO public.scadenze_sostituzioni(company_id,previsione_id,reale_id,importo_previsto_prima,stato_prima,importo_coperto,regola,stato)
  VALUES(NEW.company_id,pv.id,NEW.id,pv.amount,pv.status,least(NEW.amount,pv.amount-coalesce(pv.paid_amount,0)),'R-PREVISIONE/v1','proposta')
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.tes_previsione_da_reale() FROM PUBLIC,anon,authenticated;

-- La scadenza reale annullata o cancellata: la previsione torna com'era.
CREATE OR REPLACE FUNCTION private.tes_reale_sparita() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE z record;
BEGIN
 IF TG_OP='UPDATE' AND NOT (NEW.status='annullata' AND OLD.status IS DISTINCT FROM 'annullata') THEN RETURN NEW; END IF;
 -- Durante la purga di un'azienda (o dentro un altro trigger) non si scrive su scadenze: fermerebbe
 -- la cancellazione con «tuple already modified».
 IF pg_trigger_depth()>1 OR EXISTS(SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id AND to_jsonb(c)->>'deleted_at' IS NOT NULL) THEN
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 FOR z IN SELECT id FROM public.scadenze_sostituzioni WHERE reale_id=OLD.id AND annullato_at IS NULL LOOP
  PERFORM private.tes_annulla_sostituzione(z.id,CASE WHEN TG_OP='DELETE' THEN 'scadenza reale eliminata' ELSE 'scadenza reale annullata' END);
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION private.tes_reale_sparita() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tes_reale_sparita_cancellata ON public.scadenze;
CREATE TRIGGER tes_reale_sparita_cancellata BEFORE DELETE ON public.scadenze FOR EACH ROW EXECUTE FUNCTION private.tes_reale_sparita();
DROP TRIGGER IF EXISTS tes_reale_sparita_annullata ON public.scadenze;
CREATE TRIGGER tes_reale_sparita_annullata AFTER UPDATE OF status ON public.scadenze FOR EACH ROW EXECUTE FUNCTION private.tes_reale_sparita();

-- ─── 6. Conferma di un'alternativa dal Dettaglio movimento ──────────────────────────
-- La conferma di sempre più il registro delle fatture importate (come la conferma in lotto):
-- il risultato porta «esterne» per allineare il gestionale esterno.
CREATE OR REPLACE FUNCTION public.tesoreria_conferma_alternativa(p_company uuid,p_tx uuid,p_rows jsonb,p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE out jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 out:=public.bank_conferma_ripartizione(p_company,p_tx,p_rows,p_note);
 RETURN private.bank_record_imported(p_company,p_tx,out);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_alternativa(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_alternativa(uuid,uuid,jsonb,text) TO authenticated;

-- ─── 7. Gestionale esterno da riallineare ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tesoreria_riallineo_esterno(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 invoice_id uuid NOT NULL,
 transaction_id uuid,
 paid_date date,
 tentativi int NOT NULL DEFAULT 1,
 ultimo_errore text,
 created_at timestamptz NOT NULL DEFAULT now(),
 aggiornato_at timestamptz NOT NULL DEFAULT now(),
 risolto_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tesoreria_riallineo_esterno_aperto ON public.tesoreria_riallineo_esterno(invoice_id) WHERE risolto_at IS NULL;
CREATE INDEX IF NOT EXISTS tesoreria_riallineo_esterno_company ON public.tesoreria_riallineo_esterno(company_id) WHERE risolto_at IS NULL;
ALTER TABLE public.tesoreria_riallineo_esterno ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_riallineo_esterno FROM PUBLIC,anon,authenticated;

-- Lo segna chi ha confermato (interfaccia o cron) quando il gestionale non ha risposto.
CREATE OR REPLACE FUNCTION public.tesoreria_riallineo_segna(p_company uuid,p_invoice uuid,p_tx uuid,p_paid_date date,p_errore text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=p_invoice AND company_id=p_company) THEN RAISE EXCEPTION 'Fattura non di questa azienda' USING ERRCODE='42501'; END IF;
 INSERT INTO public.tesoreria_riallineo_esterno(company_id,invoice_id,transaction_id,paid_date,ultimo_errore)
 VALUES(p_company,p_invoice,p_tx,p_paid_date,left(p_errore,500))
 ON CONFLICT(invoice_id) WHERE risolto_at IS NULL DO UPDATE SET tentativi=public.tesoreria_riallineo_esterno.tentativi+1,
  ultimo_errore=EXCLUDED.ultimo_errore,paid_date=coalesce(EXCLUDED.paid_date,public.tesoreria_riallineo_esterno.paid_date),aggiornato_at=now();
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_riallineo_segna(uuid,uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_riallineo_segna(uuid,uuid,uuid,date,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_riallineo_da_fare(p_company uuid,p_limite int DEFAULT 20) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_id',invoice_id,'paid_date',paid_date,'tentativi',tentativi) ORDER BY aggiornato_at),'[]')
 FROM (SELECT * FROM public.tesoreria_riallineo_esterno WHERE company_id=p_company AND risolto_at IS NULL AND tentativi<20
       ORDER BY aggiornato_at LIMIT least(greatest(coalesce(p_limite,20),1),100)) x
$$;
REVOKE ALL ON FUNCTION public.tesoreria_riallineo_da_fare(uuid,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tesoreria_riallineo_da_fare(uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_riallineo_risolto(p_company uuid,p_invoice uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.tesoreria_riallineo_esterno SET risolto_at=now(),aggiornato_at=now() WHERE company_id=p_company AND invoice_id=p_invoice AND risolto_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.tesoreria_riallineo_risolto(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tesoreria_riallineo_risolto(uuid,uuid) TO service_role;

-- ─── Funzioni ridefinite per intero (dai corpi in produzione, con le correzioni) ─────
CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 t public.bank_transactions; amt numeric; impegnato numeric; resto numeric; cred boolean;
 tx_iban text; tx_nome text; tx_chiave text; causale text; ncaus text;
 cands jsonb:='[]'; confl jsonb:='[]'; c jsonb; rec record; pend record;
 num text; nnum text; subj text; motivi jsonb; conf jsonb; forza text; chiave text; party text; iban_doc text; verified boolean;
 own_accounts text[]; legs jsonb; ex jsonb; forti jsonb; medie jsonb; deboli jsonb;
 grp record; items jsonb; k int; m int; mask int; somma numeric; combo jsonb; combos jsonb; hasnc boolean;
 out jsonb; righe jsonb; diff numeric; intermediario boolean:=false; n_soggetto int; chiave_cli text;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile' USING ERRCODE='P0002'; END IF;
 amt:=abs(t.amount); cred:=t.transaction_type='credit';
 tx_iban:=coalesce(private.tes_iban(CASE WHEN cred THEN t.debtor_iban ELSE t.creditor_iban END),private.tes_iban(to_jsonb(t)->>'counterparty_iban'));
 tx_nome:=coalesce(nullif(CASE WHEN cred THEN t.debtor_name ELSE t.creditor_name END,''),nullif(to_jsonb(t)->>'counterparty_name',''));
 tx_chiave:=private.tes_chiave_nome(tx_nome);
 -- Una banca o un circuito di pagamento al posto del pagante non identifica nessuno.
 IF private.tes_norm(tx_nome)~'^(banca|banco) |\m(bank|bancaria|poste italiane|bancoposta|qonto|unicredit|intesa sanpaolo|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M' THEN
  intermediario:=true; tx_chiave:='';
 END IF;
 causale:=concat_ws(' ',t.description,t.reference); ncaus:=private.tes_norm(concat_ws(' ',causale,tx_nome));

 -- Esclusioni
 IF coalesce(t.status,'booked')<>'booked' THEN
  RETURN jsonb_build_object('esito','da_gestire','natura','sconosciuta','regola','R-ESCLUSO','versione',1,'motivi','[]'::jsonb,'conflitti','[]'::jsonb,
   'mancanti',jsonb_build_array('Il movimento non è ancora contabilizzato dalla banca'),'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 IF coalesce(t.currency,'EUR')<>'EUR' THEN
  RETURN jsonb_build_object('esito','da_gestire','natura','sconosciuta','regola','R-ESCLUSO','versione',1,'motivi','[]'::jsonb,'conflitti','[]'::jsonb,
   'mancanti',jsonb_build_array('Valuta diversa dall''euro: serve il cambio applicato dalla banca'),'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 SELECT coalesce(sum(abs(matched_amount)),0) INTO impegnato FROM public.bank_reconciliations WHERE company_id=p_company AND transaction_id=p_tx AND unmatched_at IS NULL;
 resto:=round(amt-impegnato,2);
 IF resto<=0.005 THEN
  RETURN jsonb_build_object('esito','automatico','natura','gia_riconciliato','regola','R-CHIUSO','versione',1,'motivi',jsonb_build_array('Movimento già interamente collegato'),
   'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 amt:=resto;

 -- R-GIRO: l'IBAN della controparte è un altro conto della stessa azienda.
 own_accounts:=ARRAY(SELECT private.tes_iban(to_jsonb(a)->>'iban') FROM public.bank_accounts a WHERE a.company_id=p_company AND a.id IS DISTINCT FROM t.account_id AND private.tes_iban(to_jsonb(a)->>'iban') IS NOT NULL);
 IF (tx_iban IS NOT NULL AND tx_iban=ANY(own_accounts)) OR ncaus~'\m(giroconto|giro conto|trasferimento tra conti|girofondi)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','movimento','id',o.id,'titolo',concat_ws(' · ',to_char(o.booking_date,'DD/MM/YYYY'),left(o.description,60)),'controparte',NULL,'residuo',abs(o.amount),'quota',amt,'commesse','[]'::jsonb) ORDER BY abs(o.booking_date-t.booking_date),o.id),'[]')
  INTO legs FROM public.bank_transactions o
  WHERE o.company_id=p_company AND o.id<>t.id AND o.account_id IS DISTINCT FROM t.account_id AND o.transaction_type<>t.transaction_type
   AND abs(abs(o.amount)-abs(t.amount))<0.005 AND abs(o.booking_date-t.booking_date)<=5
   AND o.chiuso_senza_documento IS NULL AND coalesce(o.reconciliation_status,'pending') NOT IN('reconciled','ignored')
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations x WHERE x.company_id=p_company AND x.transaction_id=o.id AND x.unmatched_at IS NULL)
   AND (tx_iban IS NULL OR o.account_id IN(SELECT a.id FROM public.bank_accounts a WHERE a.company_id=p_company AND private.tes_iban(to_jsonb(a)->>'iban')=tx_iban));
  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'proposta' WHEN 1 THEN CASE WHEN tx_iban IS NOT NULL THEN 'automatico' ELSE 'proposta' END ELSE 'scelta' END,
   'natura','giroconto','regola','R-GIRO','versione',1,
   'motivi',CASE WHEN tx_iban IS NOT NULL AND tx_iban=ANY(own_accounts) THEN jsonb_build_array('IBAN della controparte = un altro conto dell''azienda') ELSE jsonb_build_array('Causale di giroconto') END,
   'conflitti','[]'::jsonb,
   'mancanti',CASE WHEN jsonb_array_length(legs)=0 THEN jsonb_build_array('Il movimento opposto sull''altro conto (entro 5 giorni) non è ancora importato') ELSE '[]'::jsonb END,
   'candidati',(SELECT coalesce(jsonb_agg(jsonb_build_object('chiave','giro:'||(l->>'id'),'forza',CASE WHEN tx_iban IS NOT NULL THEN 'forte' ELSE 'media' END,'motivi',jsonb_build_array('Stesso importo, segno opposto, altro conto dell''azienda'),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))),'[]') FROM jsonb_array_elements(legs) l),
   'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,
   'nota','Un giroconto non è un costo né un ricavo');
 END IF;

 -- R-STORNO: parola di storno e un movimento opposto dello stesso importo e della stessa controparte.
 IF ncaus~'\m(storno|stornato|rimborso|reso|retrocessione|restituzione|restituito|insoluto|richiamo|revoca)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','movimento','id',o.id,'titolo',concat_ws(' · ',to_char(o.booking_date,'DD/MM/YYYY'),left(o.description,60)),'controparte',coalesce(o.debtor_name,o.creditor_name),'residuo',abs(o.amount),'quota',amt,'commesse','[]'::jsonb) ORDER BY o.booking_date DESC,o.id),'[]')
  INTO legs FROM public.bank_transactions o
  WHERE o.company_id=p_company AND o.id<>t.id AND o.transaction_type<>t.transaction_type AND abs(abs(o.amount)-amt)<0.005
   AND o.booking_date BETWEEN t.booking_date-60 AND t.booking_date
   AND ((tx_iban IS NOT NULL AND tx_iban IN(private.tes_iban(o.debtor_iban),private.tes_iban(o.creditor_iban)))
     OR (length(tx_chiave)>=5 AND tx_chiave IN(private.tes_chiave_nome(o.debtor_name),private.tes_chiave_nome(o.creditor_name))));
  IF jsonb_array_length(legs)>0 THEN
   RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(legs)=1 THEN 'proposta' ELSE 'scelta' END,'natura','storno','regola','R-STORNO','versione',1,
    'motivi',jsonb_build_array('Causale di storno o rimborso','Movimento opposto dello stesso importo e della stessa controparte negli ultimi 60 giorni'),
    'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','storno:'||(l->>'id'),'forza','media','motivi',jsonb_build_array('Storno del movimento del '||(l->>'titolo')),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))) FROM jsonb_array_elements(legs) l),
    'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,
    'nota','Lo storno riapre la partita del movimento originario: nessun ricavo o costo nuovo');
  END IF;
 END IF;

 -- R-F24: deleghe di pagamento; si collegano alle scadenze fiscali, mai a una commessa.
 IF NOT cred AND ncaus~'\m(f24|f 24|delega|deleghe|agenzia entrate|agenzia delle entrate|inps|inail|tributi|i24)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','scadenza','id',s.id,'titolo',s.description,'controparte','Erario / enti','residuo',s.amount-coalesce(s.paid_amount,0),'quota',amt,'commesse','[]'::jsonb) ORDER BY abs(s.due_date-t.booking_date),s.id),'[]')
  INTO legs FROM public.scadenze s
  WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
   AND (to_jsonb(s)->>'tipo'='scadenza_fiscale' OR private.tes_norm(s.description)~'\m(f24|iva|ritenute|inps|tributi|imposte)\M')
   AND abs(s.amount-coalesce(s.paid_amount,0)-amt)<0.005 AND (s.due_date IS NULL OR abs(s.due_date-t.booking_date)<=20)
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL AND old.scadenza_id=s.id);
  IF jsonb_array_length(legs)=0 THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','scadenza','id',s.id,'titolo',s.description,'controparte','Erario / enti','residuo',round(s.amount-coalesce(s.paid_amount,0),2),'quota',round(s.amount-coalesce(s.paid_amount,0),2),'commesse','[]'::jsonb) ORDER BY s.due_date,s.id),'[]')
   INTO items FROM (SELECT s.* FROM public.scadenze s
    WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
     AND (to_jsonb(s)->>'tipo'='scadenza_fiscale' OR private.tes_norm(s.description)~'\m(f24|iva|ritenute|inps|tributi|imposte)\M')
     AND s.amount-coalesce(s.paid_amount,0)>0.005 AND (s.due_date IS NULL OR abs(s.due_date-t.booking_date)<=20)
    ORDER BY s.due_date,s.id LIMIT 8) s;
   m:=jsonb_array_length(items); combos:='[]';
   IF m>=2 THEN
    FOR mask IN 3..(1<<m)-1 LOOP
     IF (SELECT count(*) FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0)<2 THEN CONTINUE; END IF;
     SELECT sum((items->bb->>'residuo')::numeric) INTO somma FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0;
     IF abs(somma-amt)<0.005 THEN
      SELECT jsonb_agg(items->bb ORDER BY bb) INTO righe FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0;
      combos:=combos||jsonb_build_array(jsonb_build_object('chiave','f24:'||md5(righe::text),'forza','media',
       'motivi',jsonb_build_array(format('Somma esatta di %s scadenze fiscali aperte',jsonb_array_length(righe))),'conflitti','[]'::jsonb,'righe',righe));
      EXIT WHEN jsonb_array_length(combos)>3;
     END IF;
    END LOOP;
   END IF;
   IF jsonb_array_length(combos)>0 THEN
    RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(combos)=1 THEN 'proposta' ELSE 'scelta' END,
     'natura','f24','regola','R-F24','versione',1,'motivi',jsonb_build_array('Causale di delega F24 o di un ente')||(combos->0->'motivi'),'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,
     'candidati',combos,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,'nota','Un F24 non è un costo di commessa: ogni componente chiude la sua scadenza');
   END IF;
  END IF;
  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'da_gestire' WHEN 1 THEN 'automatico' ELSE 'scelta' END,
   'natura','f24','regola','R-F24','versione',1,'motivi',jsonb_build_array('Causale di delega F24 o di un ente'),'conflitti','[]'::jsonb,
   'mancanti',CASE WHEN jsonb_array_length(legs)=0 THEN jsonb_build_array('Una scadenza fiscale (F24) con lo stesso importo entro 20 giorni: senza, le componenti del modello non sono note') ELSE '[]'::jsonb END,
   'candidati',(SELECT coalesce(jsonb_agg(jsonb_build_object('chiave','f24:'||(l->>'id'),'forza','forte','motivi',jsonb_build_array('Scadenza fiscale con lo stesso importo'),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))),'[]') FROM jsonb_array_elements(legs) l),
   'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,'nota','Un F24 non è un costo di commessa');
 END IF;

 -- Candidati documentali
 FOR rec IN
  SELECT CASE WHEN coalesce(to_jsonb(d)->>'origine','nativa')='nativa' THEN 'documento' ELSE 'invoice' END tipo,d.id,d.numero titolo,d.numero numero,coalesce(nullif(to_jsonb(d)->>'anno','')::int,extract(year FROM nullif(to_jsonb(d)->>'data_emissione','')::date)::int) anno,
   coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),'')) party,
   private.tes_iban(coalesce(d.cliente_snapshot->>'iban',d.cliente_snapshot->>'iban_bancario')) iban, NULL::uuid supplier_id,
   round(d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0),2) residuo, d.data_scadenza scad, (d.tipo='nota_credito') nc
  FROM public.documenti_fiscali_elenco_operativo d
  WHERE cred AND d.company_id=p_company AND d.deleted_at IS NULL
   AND d.stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   AND d.tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito','nota_credito')
   AND d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0)>0.005
  UNION ALL
  SELECT 'scadenza',s.id,s.description,coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),s.description),
   extract(year FROM nullif(to_jsonb(cc)->>'documento_data','')::date)::int,
   f.name,private.tes_iban(to_jsonb(f)->>'iban'),s.supplier_id,round(s.amount-coalesce(s.paid_amount,0),2),s.due_date,false
  FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   LEFT JOIN public.company_costs cc ON cc.id=s.cost_id AND cc.company_id=s.company_id
  WHERE NOT cred AND s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
   AND coalesce(to_jsonb(s)->>'tipo','')<>'scadenza_fiscale' AND s.amount-coalesce(s.paid_amount,0)>0.005
  UNION ALL
  SELECT 'nota_ricevuta',n.id,concat_ws(' ','Nota di credito',n.numero_fattura),n.numero_fattura,extract(year FROM n.data_fattura)::int,
   coalesce(f.name,n.cedente_ragione_sociale),private.tes_iban(to_jsonb(f)->>'iban'),n.fornitore_id,round(abs(coalesce(n.totale_documento,0)),2),n.data_fattura,true
  FROM public.fatture_ricevute n LEFT JOIN public.suppliers f ON f.id=n.fornitore_id AND f.company_id=n.company_id
  WHERE NOT cred AND n.company_id=p_company AND n.tipo_documento IN('TD04','passive_credit_note') AND abs(coalesce(n.totale_documento,0))>0.005
   AND coalesce(n.stato,'') NOT IN('annullata','scartata','rifiutata','eliminata')
   AND NOT EXISTS(SELECT 1 FROM public.note_credito_storni z WHERE z.company_id=p_company AND z.nota_id=n.id)
  UNION ALL
  SELECT 'rata',i.id,concat_ws(' · ',o.order_code,i.label),NULL,NULL,coalesce(nullif(o.client_company,''),nullif(o.client_name,'')),NULL,NULL,round(i.amount,2),i.expected_date,false
  FROM public.order_installments i JOIN public.orders o ON o.id=i.order_id AND o.company_id=p_company AND o.deleted_at IS NULL
  WHERE cred AND NOT coalesce(i.is_paid,false) AND i.invoice_id IS NULL AND i.documento_fiscale_id IS NULL AND coalesce(i.amount,0)>0.005
 LOOP
  -- Abbinamenti annullati in passato non si ripropongono.
  IF EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL
     AND (rec.id IN(old.invoice_id,old.documento_id,old.scadenza_id) OR to_jsonb(old)->'payment_source'->>'documento_id'=rec.id::text OR to_jsonb(old)->'payment_source'->>'scadenza_id'=rec.id::text)) THEN
   CONTINUE;
  END IF;
  motivi:='[]'; conf:='[]'; subj:=NULL; party:=rec.party; chiave:=private.tes_chiave_nome(party);
  -- Identità
  verified:=false;
  IF tx_iban IS NOT NULL AND rec.tipo IN('documento','invoice') THEN
   SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva',''),nullif(d.cliente_snapshot->>'codice_fiscale','')))
     INTO chiave_cli FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=rec.id AND d.company_id=p_company;
   IF length(coalesce(chiave_cli,''))>=8 THEN
    verified:=EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale=chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL);
    IF NOT verified AND EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale<>chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL) THEN
     conf:=conf||to_jsonb('IBAN verificato di un altro cliente'::text);
    END IF;
   END IF;
  END IF;
  IF tx_iban IS NOT NULL AND rec.supplier_id IS NOT NULL THEN
   verified:=EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id=rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban);
   IF NOT verified AND EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id<>rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban) THEN
    conf:=conf||to_jsonb('IBAN verificato di un altro fornitore'::text);
   END IF;
  END IF;
  IF verified THEN subj:='iban_verificato'; motivi:=motivi||to_jsonb('IBAN verificato della controparte'::text);
  ELSIF tx_iban IS NOT NULL AND rec.iban IS NOT NULL AND tx_iban=rec.iban THEN subj:='iban'; motivi:=motivi||to_jsonb('IBAN in anagrafica uguale'::text);
  ELSIF length(chiave)>=4 AND ((length(tx_chiave)>=4 AND (strpos(tx_chiave,chiave)>0 OR strpos(chiave,tx_chiave)>0)) OR (length(chiave)>=6 AND strpos(replace(ncaus,' ',''),chiave)>0)) THEN
   subj:='nome'; motivi:=motivi||to_jsonb('Controparte corrispondente'::text);
  END IF;
  -- Numero con anno e soggetto
  nnum:=CASE WHEN rec.numero IS NOT NULL THEN private.tes_numero_in_causale(causale,private.tes_numero_nucleo(rec.numero),rec.anno) ELSE 'no' END;
  IF nnum='anno_diverso' THEN conf:=conf||to_jsonb(format('Il numero %s compare con un anno diverso da %s',rec.numero,rec.anno)); END IF;
  IF nnum IN('si','anno') THEN
   motivi:=motivi||to_jsonb(CASE WHEN nnum='anno' THEN 'Numero e anno del documento nella causale' ELSE 'Numero del documento nella causale' END);
   -- Il numero vale insieme al soggetto: un pagante diverso serve un rapporto documentato.
   IF subj IS NULL AND length(tx_chiave)>=4 AND length(chiave)>=4 THEN
    IF EXISTS(SELECT 1 FROM public.tesoreria_paganti_autorizzati pa WHERE pa.company_id=p_company AND pa.revocato_at IS NULL
        AND (private.tes_chiave_nome(pa.soggetto_nome)=chiave OR pa.soggetto_id=rec.supplier_id)
        AND (private.tes_chiave_nome(pa.pagante_nome)=tx_chiave OR private.tes_iban(pa.pagante_iban)=tx_iban)) THEN
     subj:='terzo_documentato'; motivi:=motivi||to_jsonb('Pagante terzo con rapporto documentato'::text);
    ELSE
     conf:=conf||to_jsonb(CASE WHEN cred THEN format('Il pagante «%s» non è l''intestatario «%s» e non c''è un rapporto documentato',tx_nome,party)
                               ELSE format('Il beneficiario «%s» non è il fornitore «%s» e non c''è un rapporto documentato',tx_nome,party) END);
    END IF;
   END IF;
  END IF;
  -- Data
  IF rec.scad IS NOT NULL AND t.booking_date IS NOT NULL AND abs(t.booking_date-rec.scad)<=30 THEN motivi:=motivi||to_jsonb('Data entro 30 giorni dalla scadenza'::text); END IF;
  forza:=CASE WHEN subj IN('iban_verificato','terzo_documentato') OR (nnum IN('si','anno') AND subj IS NOT NULL) THEN 'forte'
              WHEN subj IS NOT NULL OR (nnum IN('si','anno') AND length(private.tes_numero_nucleo(rec.numero))>=3) THEN 'media' ELSE 'debole' END;
  c:=jsonb_build_object('tipo',rec.tipo,'id',rec.id,'titolo',rec.titolo,'controparte',party,'chiave_soggetto',chiave,'residuo',CASE WHEN rec.nc THEN -rec.residuo ELSE rec.residuo END,
   'nc',rec.nc,'forza',forza,'motivi',motivi,'conflitti',conf,'data',rec.scad);
  -- Un conflitto conta solo su un candidato che, per importo, potrebbe essere questo pagamento.
  IF jsonb_array_length(conf)>0 THEN
   IF abs(rec.residuo-amt)<=1.00 THEN confl:=confl||jsonb_build_array(c); END IF;
  ELSE cands:=cands||jsonb_build_array(c); END IF;
 END LOOP;

 -- 1. Documento unico con l'importo esatto (le note di credito non si pagano da sole).
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO forti FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='forte';
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO medie FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='media';
 IF jsonb_array_length(forti)>0 OR jsonb_array_length(medie)>0 THEN
  ex:=CASE WHEN jsonb_array_length(forti)>0 THEN forti ELSE medie END;
  out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)>1 THEN 'scelta' WHEN jsonb_array_length(forti)=1 AND jsonb_array_length(confl)=0 THEN 'automatico' ELSE 'proposta' END,
   'natura','documento','regola','R-DOC','versione',1,'differenza',0);
  out:=out||jsonb_build_object('candidati',(SELECT jsonb_agg(jsonb_build_object('chiave',(x->>'tipo')||':'||(x->>'id'),'forza',x->>'forza','motivi',(x->'motivi')||to_jsonb('Importo uguale al residuo'::text),'conflitti','[]'::jsonb,
    'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))) FROM jsonb_array_elements(ex) x));
 END IF;

 -- 2. Cumulativo (con eventuali note di credito): partite dello stesso soggetto che sommano esattamente.
 IF out IS NULL THEN
  combos:='[]';
  FOR grp IN SELECT x->>'chiave_soggetto' k,jsonb_agg(x ORDER BY x->>'data' NULLS LAST,x->>'id') its FROM jsonb_array_elements(cands) x
             WHERE x->>'forza' IN('forte','media') AND length(coalesce(x->>'chiave_soggetto',''))>=4 AND x->>'tipo'<>'rata' GROUP BY 1 LOOP
   items:=grp.its; m:=least(jsonb_array_length(items),8);
   IF m<2 THEN CONTINUE; END IF;
   FOR mask IN 3..(1<<m)-1 LOOP
    IF (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0)<2 THEN CONTINUE; END IF;
    SELECT sum((items->b->>'residuo')::numeric),bool_or((items->b->>'nc')::boolean) INTO somma,hasnc FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0;
    IF abs(somma-amt)<0.005 AND (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0 AND NOT (items->b->>'nc')::boolean)>=1 THEN
     SELECT jsonb_agg(jsonb_build_object('tipo',items->b->>'tipo','id',items->b->>'id','titolo',items->b->>'titolo','controparte',items->b->>'controparte','residuo',(items->b->>'residuo')::numeric,'quota',(items->b->>'residuo')::numeric) ORDER BY b) INTO righe
     FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0;
     combos:=combos||jsonb_build_array(jsonb_build_object('chiave','cumulo:'||md5(righe::text),'forza','media','nc',hasnc,
      'motivi',jsonb_build_array('Stesso soggetto',format('Somma esatta di %s partite aperte',jsonb_array_length(righe)))||CASE WHEN hasnc THEN jsonb_build_array('Compensata con nota di credito') ELSE '[]'::jsonb END,
      'conflitti','[]'::jsonb,'righe',righe));
     EXIT WHEN jsonb_array_length(combos)>3;
    END IF;
   END LOOP;
  END LOOP;
  IF jsonb_array_length(combos)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(combos)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN (SELECT bool_or((x->>'nc')::boolean) FROM jsonb_array_elements(combos) x) THEN 'compensazione_nc' ELSE 'cumulativo' END,
    'regola',CASE WHEN (SELECT bool_or((x->>'nc')::boolean) FROM jsonb_array_elements(combos) x) THEN 'R-NC' ELSE 'R-CUMULO' END,'versione',1,'differenza',0,
    'candidati',(SELECT jsonb_agg(x-'nc') FROM jsonb_array_elements(combos) x));
  END IF;
 END IF;

 -- 3. Differenza fino a 1 € (commissione o arrotondamento), soggetto certo.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND x->>'forza' IN('forte','media') AND abs((x->>'residuo')::numeric-amt) BETWEEN 0.005 AND 1.00;
  IF jsonb_array_length(ex)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,'natura','differenza','regola','R-DIFF','versione',1,
    'differenza',round((ex->0->>'residuo')::numeric-amt,2),
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','diff:'||(x->>'id'),'forza',x->>'forza','motivi',(x->'motivi')||to_jsonb(format('Differenza di %s € da classificare (commissione o arrotondamento)',round(abs((x->>'residuo')::numeric-amt),2))),'conflitti','[]'::jsonb,
     'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',least(amt,(x->>'residuo')::numeric)))))
     FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- 4. Acconto prima della fattura: rata della commessa del cliente, non ancora fatturata.
 IF out IS NULL AND cred THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE x->>'tipo'='rata' AND x->>'forza' IN('forte','media') AND abs((x->>'residuo')::numeric-amt)<0.005;
  IF jsonb_array_length(ex)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,'natura','acconto','regola','R-ACCONTO','versione',1,'differenza',0,
    'nota','L''acconto si collega alla rata: quando arriva la fattura della rata il denaro è già contato',
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','rata:'||(x->>'id'),'forza','media','motivi',(x->'motivi')||to_jsonb('Rata della commessa non ancora fatturata, stesso importo'::text),'conflitti','[]'::jsonb,
     'righe',jsonb_build_array(jsonb_build_object('tipo','rata','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))) FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- 5. Parziale o eccedente su un documento del soggetto certo.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND (x->>'forza'='forte' OR (x->>'forza'='media' AND x->'motivi' @> '["Controparte corrispondente"]'::jsonb) OR (x->>'forza'='media' AND (x->'motivi')::text LIKE '%IBAN%'));
  -- un parziale ha senso su un solo documento; se ce ne sono più, prima quelli col numero in causale
  IF jsonb_array_length(ex)>1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(ex) x WHERE (x->'motivi')::text LIKE '%Numero%') THEN
   SELECT jsonb_agg(x) INTO ex FROM jsonb_array_elements(ex) x WHERE (x->'motivi')::text LIKE '%Numero%';
  END IF;
  IF jsonb_array_length(ex)>0 THEN
   diff:=CASE WHEN jsonb_array_length(ex)=1 THEN greatest(round(amt-(ex->0->>'residuo')::numeric,2),0) ELSE 0 END;
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN jsonb_array_length(ex)=1 AND amt>(ex->0->>'residuo')::numeric THEN 'eccedenza' ELSE 'parziale' END,
    'regola','R-PARZIALE','versione',1,'differenza',diff,
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','parz:'||(x->>'id'),'forza',x->>'forza',
      'motivi',(x->'motivi')||to_jsonb(CASE WHEN amt<(x->>'residuo')::numeric THEN format('Pagamento parziale: resteranno %s €',round((x->>'residuo')::numeric-amt,2)) ELSE format('Il movimento supera il residuo di %s €: il resto va qualificato (acconto o eccedenza), non è un ricavo',round(amt-(x->>'residuo')::numeric,2)) END),
      'conflitti','[]'::jsonb,
      'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',least(amt,(x->>'residuo')::numeric)))))
     FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- Conflitti senza alternative valide: blocco.
 IF out IS NULL AND jsonb_array_length(confl)>0 THEN
  out:=jsonb_build_object('esito','conflitto','natura','documento','regola','R-CONFLITTO','versione',1,'differenza',0,'candidati','[]'::jsonb);
 END IF;

 -- Spese bancarie e resto.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('chiave',(x->>'tipo')||':'||(x->>'id'),'forza','debole','motivi',jsonb_build_array('Solo l''importo coincide'),'conflitti','[]'::jsonb,
    'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))),'[]')
  INTO deboli FROM jsonb_array_elements(cands) x WHERE x->>'forza'='debole' AND NOT (x->>'nc')::boolean AND abs((x->>'residuo')::numeric-amt)<0.005;
  SELECT count(*) INTO n_soggetto FROM jsonb_array_elements(cands) x WHERE x->>'forza' IN('forte','media');
  out:=jsonb_build_object('esito','da_gestire','regola','R-NESSUNO','versione',1,'differenza',0,'candidati',deboli,
   'natura',CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'spesa_bancaria'
                 WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') THEN 'spesa_carta'
                 ELSE 'sconosciuta' END,
   'mancanti',(SELECT coalesce(jsonb_agg(v),'[]') FROM unnest(ARRAY[
     CASE WHEN tx_nome IS NULL AND tx_iban IS NULL THEN 'Nome e IBAN della controparte (la banca non li ha comunicati)' END,
     CASE WHEN jsonb_array_length(deboli)>0 THEN 'Il soggetto o il numero del documento: coincide solo l''importo' END,
     CASE WHEN n_soggetto>0 THEN format('%s partite aperte della stessa controparte, nessuna con questo importo né una somma esatta',n_soggetto) END,
     CASE WHEN n_soggetto=0 AND jsonb_array_length(deboli)=0 AND tx_nome IS NOT NULL AND NOT intermediario THEN format('Nessuna partita aperta di «%s»: il documento non è ancora registrato?',tx_nome) END,
     CASE WHEN intermediario THEN 'La banca ha comunicato un intermediario, non il pagante: serve il riferimento del documento' END,
     CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'Spesa bancaria: si registra come movimento senza fattura' END,
     CASE WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') AND NOT ncaus~'\m(commissioni|commissione|canone|fx)\M' THEN 'Acquisto con carta: serve la ricevuta o la fattura del negozio' END]) v WHERE v IS NOT NULL));
 END IF;

 -- Commesse dalle righe del primo candidato; motivi e conflitti a livello di esito.
 righe:='[]'; k:=0;
 IF jsonb_array_length(coalesce(out->'candidati','[]'))>0 THEN
  FOR c IN SELECT value FROM jsonb_array_elements(out->'candidati'->0->'righe') LOOP
   ex:=private.tes_commesse_riga(p_company,c->>'tipo',(c->>'id')::uuid,(c->>'quota')::numeric);
   IF jsonb_typeof(ex)='object' THEN k:=1; ex:='[]'; END IF;
   righe:=righe||ex;
  END LOOP;
  out:=jsonb_set(out,'{candidati}',(SELECT jsonb_agg(jsonb_set(cd,'{righe}',(SELECT jsonb_agg(r||jsonb_build_object('commesse',CASE WHEN jsonb_typeof(z)='array' THEN z ELSE '[]'::jsonb END,'ripartizione_da_completare',jsonb_typeof(z)='object'))
     FROM jsonb_array_elements(cd->'righe') r CROSS JOIN LATERAL (SELECT private.tes_commesse_riga(p_company,r->>'tipo',(r->>'id')::uuid,(r->>'quota')::numeric) z) zz))) FROM jsonb_array_elements(out->'candidati') cd));
 END IF;
 out:=out||jsonb_build_object(
  'commesse',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_id',o,'quota',q) ORDER BY o),'[]') FROM (SELECT x->>'order_id' o,round(sum((x->>'quota')::numeric),2) q FROM jsonb_array_elements(righe) x GROUP BY 1) g),
  'ripartizione_da_completare',k=1,
  'motivi',coalesce(out->'candidati'->0->'motivi','[]'::jsonb),
  'conflitti',coalesce((SELECT jsonb_agg(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','motivi',x->'conflitti')) FROM jsonb_array_elements(confl) x),'[]'::jsonb),
  'mancanti',coalesce(out->'mancanti','[]'::jsonb));
 RETURN out;
END $fn$;
REVOKE ALL ON FUNCTION private.tes_classifica(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tes_commesse_riga(p_company uuid,p_tipo text,p_id uuid,p_quota numeric) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r jsonb; tot numeric; n int; o uuid; c uuid; alloc jsonb;
BEGIN
 IF p_tipo IN('documento','invoice') THEN
  SELECT count(*),sum(coalesce(importo_associato,0)) INTO n,tot FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
  IF n=1 THEN
   SELECT jsonb_build_array(jsonb_build_object('order_id',ordine_id,'quota',round(p_quota,2))) INTO r FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
   RETURN r;
  ELSIF n>1 THEN
   IF coalesce(tot,0)<=0 OR EXISTS(SELECT 1 FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id AND coalesce(importo_associato,0)<=0) THEN
    RETURN jsonb_build_object('da_completare',true);
   END IF;
   SELECT jsonb_agg(jsonb_build_object('order_id',ordine_id,'quota',round(p_quota*importo_associato/tot,2)) ORDER BY ordine_id) INTO r
   FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
   RETURN r;
  END IF;
  SELECT ordine_id INTO o FROM public.documenti_fiscali_elenco_operativo WHERE id=p_id AND company_id=p_company;
 ELSIF p_tipo='scadenza' THEN
  SELECT order_id,cost_id INTO o,c FROM public.scadenze WHERE id=p_id AND company_id=p_company;
  IF o IS NULL AND c IS NOT NULL THEN
   SELECT order_id,allocations INTO o,alloc FROM public.company_costs WHERE id=c AND company_id=p_company;
   IF o IS NULL AND jsonb_typeof(alloc)='array' AND jsonb_array_length(alloc)>0 THEN
    SELECT jsonb_agg(jsonb_build_object('order_id',(a->>'order_id')::uuid,'quota',round(p_quota*(a->>'pct')::numeric/100,2)) ORDER BY a->>'order_id') INTO r
    FROM jsonb_array_elements(alloc) a WHERE a->>'order_id'~'^[0-9a-fA-F-]{36}$' AND a->>'pct'~'^[0-9]+(\.[0-9]+)?$';
    RETURN coalesce(r,'[]');
   END IF;
  END IF;
 ELSIF p_tipo='rata' THEN
  SELECT i.order_id INTO o FROM public.order_installments i JOIN public.orders x ON x.id=i.order_id AND x.company_id=p_company WHERE i.id=p_id;
 END IF;
 RETURN CASE WHEN o IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('order_id',o,'quota',round(p_quota,2))) END;
END $fn$;
REVOKE ALL ON FUNCTION private.tes_commesse_riga(uuid,text,uuid,numeric) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tes_conferma_una(p_company uuid,p_tx uuid,p_nature text[],p_modo text DEFAULT 'auto') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE res jsonb; cd jsonb; righe jsonb:='[]'; r jsonb; somma numeric; t public.bank_transactions; out jsonb; leg uuid; traccia jsonb:='[]'; riga jsonb;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 IF t.chiuso_senza_documento IS NOT NULL THEN RETURN NULL; END IF;  -- p.es. l'altra gamba di un giroconto appena chiuso
 IF EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=p_tx AND e.scartato_at IS NOT NULL) THEN RETURN NULL; END IF;
 res:=private.tes_classifica(p_company,p_tx);
 IF res->>'esito'<>'automatico' OR NOT (res->>'natura'=ANY(p_nature)) OR jsonb_array_length(res->'candidati')<>1 THEN RETURN NULL; END IF;
 cd:=res->'candidati'->0;
 -- 2. nessun conflitto, né sul candidato né su altri candidati dello stesso movimento
 IF cd->>'forza'<>'forte' OR jsonb_array_length(cd->'conflitti')>0 OR jsonb_array_length(coalesce(res->'conflitti','[]'::jsonb))>0 THEN RETURN NULL; END IF;
 -- 1. un candidato scartato da una persona non si conferma mai, anche se lo scarto è stato superato
 IF EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=p_tx AND (cd->>'chiave')=ANY(coalesce(e.scartato_chiavi,'{}'))) THEN RETURN NULL; END IF;
 SELECT sum((x->>'quota')::numeric) INTO somma FROM jsonb_array_elements(cd->'righe') x;
 IF res->>'natura'='documento' THEN
  IF NOT t.transaction_type='credit' THEN RETURN NULL; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(cd->'righe') LOOP
   -- nativa → 'documento'; importata da un gestionale esterno → 'invoice' (poi il write-back)
   IF r->>'tipo' NOT IN('documento','invoice') THEN RETURN NULL; END IF;
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
END $fn$;
REVOKE ALL ON FUNCTION private.tes_conferma_una(uuid,uuid,text[],text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid,p_limite int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
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
    AND (e.natura='giroconto' OR t.transaction_type='credit')
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
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conferma_automatica(uuid,int) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_stato_automatismo(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ultima record; errore record; attesa int;
BEGIN
 BEGIN
  PERFORM private.bank_operativa_access(p_company,false);
 EXCEPTION WHEN OTHERS THEN RETURN NULL;
 END;
 SELECT count(*) INTO attesa FROM public.tesoreria_esiti e JOIN public.bank_transactions t ON t.id=e.transaction_id
 WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura IN('documento','giroconto') AND e.scartato_at IS NULL
  AND (e.natura='giroconto' OR t.transaction_type='credit')
  AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion');
 SELECT s.il,s.evento INTO ultima FROM public.tesoreria_esiti_storia s WHERE s.company_id=p_company AND s.evento IN('confermato_auto','confermato_clic') ORDER BY s.il DESC LIMIT 1;
 SELECT s.il,s.risultato->>'errore' errore INTO errore FROM public.tesoreria_esiti_storia s WHERE s.company_id=p_company AND s.evento='errore_auto' ORDER BY s.il DESC LIMIT 1;
 RETURN jsonb_build_object('in_attesa',attesa,'ultima_conferma_il',ultima.il,'ultima_conferma',ultima.evento,
  'ultimo_errore_il',CASE WHEN errore.il>coalesce(ultima.il,'-infinity'::timestamptz) THEN errore.il END,
  'ultimo_errore',CASE WHEN errore.il>coalesce(ultima.il,'-infinity'::timestamptz) THEN errore.errore END);
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_stato_automatismo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_stato_automatismo(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_classifica_movimenti(p_company uuid,p_limite int DEFAULT 100,p_anteprima boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r record; res jsonb; imp text; v_chiavi text[]; prev public.tesoreria_esiti; conteggi jsonb:='{}'; cambiati int:=0; esempi jsonb:='[]'; n int:=0;
BEGIN
 -- 11. anche l'anteprima scorre centinaia di movimenti: solo chi può riconciliare
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,3101)); END IF;
 FOR r IN SELECT t.id FROM public.bank_transactions t LEFT JOIN public.tesoreria_esiti e ON e.transaction_id=t.id
   WHERE t.company_id=p_company AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion','parziale')
   ORDER BY e.calcolato_at ASC NULLS FIRST,t.booking_date DESC,t.id LIMIT least(greatest(coalesce(p_limite,100),1),500)
 LOOP
  n:=n+1;
  res:=private.tes_classifica(p_company,r.id);
  imp:=md5(res::text);
  v_chiavi:=ARRAY(SELECT c->>'chiave' FROM jsonb_array_elements(coalesce(res->'candidati','[]'::jsonb)) c ORDER BY 1);
  conteggi:=jsonb_set(conteggi,ARRAY[res->>'esito'],to_jsonb(coalesce((conteggi->>(res->>'esito'))::int,0)+1));
  SELECT * INTO prev FROM public.tesoreria_esiti WHERE transaction_id=r.id;
  IF prev.impronta IS DISTINCT FROM imp THEN
   cambiati:=cambiati+1;
   IF jsonb_array_length(esempi)<10 THEN esempi:=esempi||jsonb_build_array(jsonb_build_object('transaction_id',r.id,'prima',prev.esito,'dopo',res->>'esito','natura',res->>'natura')); END IF;
   IF NOT p_anteprima THEN
    INSERT INTO public.tesoreria_esiti(transaction_id,company_id,esito,natura,regola,versione,risultato,impronta,calcolato_at)
    VALUES(r.id,p_company,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,res,imp,now())
    ON CONFLICT(transaction_id) DO UPDATE SET esito=EXCLUDED.esito,natura=EXCLUDED.natura,regola=EXCLUDED.regola,versione=EXCLUDED.versione,
      risultato=EXCLUDED.risultato,impronta=EXCLUDED.impronta,calcolato_at=now(),
      -- 1. lo scarto resta finché fra i candidati non ne compare uno nuovo; i candidati scartati restano scartati
      scartato_at=CASE WHEN v_chiavi<@coalesce(tesoreria_esiti.scartato_chiavi,'{}') THEN tesoreria_esiti.scartato_at END,
      scartato_da=CASE WHEN v_chiavi<@coalesce(tesoreria_esiti.scartato_chiavi,'{}') THEN tesoreria_esiti.scartato_da END,
      scartato_motivo=CASE WHEN v_chiavi<@coalesce(tesoreria_esiti.scartato_chiavi,'{}') THEN tesoreria_esiti.scartato_motivo END;
    INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,da)
    VALUES(p_company,r.id,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,imp,res,auth.uid())
    ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
   END IF;
  ELSIF NOT p_anteprima THEN
   UPDATE public.tesoreria_esiti SET calcolato_at=now() WHERE transaction_id=r.id;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('analizzati',n,'cambiati',cambiati,'per_esito',conteggi,'anteprima',p_anteprima,'esempi',esempi);
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_classifica_movimenti(uuid,int,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_classifica_movimenti(uuid,int,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_scarta_esito(p_company uuid,p_tx uuid,p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE e public.tesoreria_esiti;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(btrim(coalesce(p_motivo,'')))<3 THEN RAISE EXCEPTION 'Scrivi perché la proposta non è giusta' USING ERRCODE='22023'; END IF;
 UPDATE public.tesoreria_esiti SET scartato_at=now(),scartato_da=auth.uid(),scartato_motivo=left(btrim(p_motivo),500),
  scartato_chiavi=ARRAY(SELECT DISTINCT x FROM unnest(coalesce(scartato_chiavi,'{}')||ARRAY(SELECT c->>'chiave' FROM jsonb_array_elements(coalesce(risultato->'candidati','[]'::jsonb)) c)) x ORDER BY 1)
 WHERE transaction_id=p_tx AND company_id=p_company AND scartato_at IS NULL RETURNING * INTO e;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta non più disponibile: ricarica il movimento' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('motivo',e.scartato_motivo),'scartato',auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),da=EXCLUDED.da,risultato=EXCLUDED.risultato;
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_scarta_esito(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_scarta_esito(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_ricorda_iban_cliente(p_company uuid,p_tx uuid,p_documento uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t public.bank_transactions; v_iban text; v_chiave text; v_nome text; sid uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND OR t.transaction_type<>'credit' THEN RAISE EXCEPTION 'Serve un incasso di questa azienda' USING ERRCODE='22023'; END IF;
 v_iban:=coalesce(private.tes_iban(t.debtor_iban),private.tes_iban(to_jsonb(t)->>'counterparty_iban'));
 IF v_iban IS NULL THEN RAISE EXCEPTION 'La banca non ha comunicato l''IBAN dell''ordinante' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r LEFT JOIN public.movimenti_cassa_native m ON m.id=r.movimento_id AND m.company_id=r.company_id
     WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.unmatched_at IS NULL AND p_documento IN(r.documento_id,m.documento_id,r.invoice_id,private.tes_uuid(to_jsonb(r)->'payment_source'->>'documento_id'),private.tes_uuid(to_jsonb(r)->'payment_source'->>'invoice_id'))) THEN
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
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_ricorda_iban_da_quota(p_company uuid,p_riconciliazione uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.bank_reconciliations; v_doc uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO r FROM public.bank_reconciliations WHERE id=p_riconciliazione AND company_id=p_company AND unmatched_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Collegamento non più attivo: ricarica il movimento' USING ERRCODE='P0002'; END IF;
 v_doc:=coalesce(r.documento_id,
   (SELECT m.documento_id FROM public.movimenti_cassa_native m WHERE m.id=r.movimento_id AND m.company_id=p_company),
   r.invoice_id,
   private.tes_uuid(to_jsonb(r)->'payment_source'->>'documento_id'),private.tes_uuid(to_jsonb(r)->'payment_source'->>'invoice_id'));
 IF v_doc IS NULL THEN RAISE EXCEPTION 'Questo collegamento non è su una fattura emessa' USING ERRCODE='22023'; END IF;
 RETURN public.tesoreria_ricorda_iban_cliente(p_company,r.transaction_id,v_doc);
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_ricorda_iban_da_quota(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_ricorda_iban_da_quota(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_registra_pagante(p_company uuid,p_soggetto_nome text,p_pagante_nome text,p_pagante_iban text,p_prova text,p_soggetto_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE sid uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(btrim(coalesce(p_soggetto_nome,'')))<2 THEN RAISE EXCEPTION 'Indica l''intestatario dei documenti' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(coalesce(p_pagante_nome,'')),'') IS NULL AND private.tes_iban(p_pagante_iban) IS NULL THEN RAISE EXCEPTION 'Indica il nome o l''IBAN di chi paga' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_prova,'')))<3 THEN RAISE EXCEPTION 'Scrivi la prova del rapporto (delega, contratto, mail del cliente…)' USING ERRCODE='22023'; END IF;
 INSERT INTO public.tesoreria_paganti_autorizzati(company_id,soggetto_nome,soggetto_id,pagante_nome,pagante_iban,prova,created_by)
 VALUES(p_company,btrim(p_soggetto_nome),p_soggetto_id,nullif(btrim(coalesce(p_pagante_nome,'')),''),private.tes_iban(p_pagante_iban),left(btrim(p_prova),1000),auth.uid())
 ON CONFLICT DO NOTHING RETURNING id INTO sid;
 IF sid IS NULL THEN
  SELECT id INTO sid FROM public.tesoreria_paganti_autorizzati WHERE company_id=p_company AND revocato_at IS NULL
   AND lower(soggetto_nome)=lower(btrim(p_soggetto_nome)) AND coalesce(lower(pagante_nome),'')=coalesce(lower(nullif(btrim(coalesce(p_pagante_nome,'')),'')),'')
   AND coalesce(pagante_iban,'')=coalesce(private.tes_iban(p_pagante_iban),'');
 END IF;
 RETURN sid;
END $fn$;
REVOKE ALL ON FUNCTION public.tesoreria_registra_pagante(uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_registra_pagante(uuid,text,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cdg_controllo_doppi(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE out jsonb:='[]';
BEGIN
 IF coalesce(auth.role(),'')<>'service_role'
    AND NOT coalesce(public.has_permission_for_company(auth.uid(),'can_view_controllo_gestione',p_company),false)
    AND NOT coalesce(public.has_permission_for_company(auth.uid(),'can_view_tesoreria',p_company),false) THEN
  RAISE EXCEPTION 'Non hai il permesso di vedere questi controlli' USING ERRCODE='42501';
 END IF;
 -- 1. Quote di un movimento oltre il suo importo
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','movimento_oltre_importo','ids',jsonb_build_array(t.id),'importo',round(q.s-abs(t.amount),2),
   'descrizione',format('Movimento del %s: collegati %s € su %s €',to_char(t.booking_date,'DD/MM/YYYY'),round(q.s,2),abs(t.amount)),'cosa_fare','Scollegare la quota in più'))
  FROM public.bank_transactions t JOIN (SELECT transaction_id,sum(abs(matched_amount)) s FROM public.bank_reconciliations WHERE company_id=p_company AND unmatched_at IS NULL GROUP BY 1) q ON q.transaction_id=t.id
  WHERE t.company_id=p_company AND q.s>abs(t.amount)+0.005),'[]');
 -- 2. Incassi oltre il totale della fattura emessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','documento_oltre_totale','ids',jsonb_build_array(d.id),'importo',round(d.importo_pagato-d.totale_da_pagare,2),
   'descrizione',format('Fattura %s: incassati %s € su %s €',d.numero,d.importo_pagato,d.totale_da_pagare),
   'cosa_fare',CASE WHEN abs(coalesce(d.importo_pagato,0)-coalesce(d.totale_documento,0))<0.01 THEN 'Incassato il lordo: la ritenuta (o lo split payment) è stata registrata come incasso, va stornata'
                    ELSE 'Controllare gli incassi doppi della fattura' END))
  FROM public.documenti_fiscali_elenco_operativo d WHERE d.company_id=p_company AND d.deleted_at IS NULL AND d.tipo<>'nota_credito' AND d.totale_da_pagare>0 AND coalesce(d.importo_pagato,0)>d.totale_da_pagare+1.00),'[]');
 -- 3. Spesa creata da un movimento mentre un debito aperto dello stesso fornitore aspettava quel pagamento.
 --    Il fornitore è quello della spesa o quello riconosciuto dall'IBAN del movimento; vale anche un pagamento parziale.
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','spesa_da_banca_su_debito_aperto','ids',jsonb_build_array(x.cost_id,x.sc_id),'importo',x.amount,
   'descrizione',format('Spesa «%s» da banca (%s €) e scadenza aperta «%s» dello stesso fornitore (residuo %s €)',x.name,x.amount,x.description,x.residuo),
   'cosa_fare','Se è lo stesso debito: riaprire il movimento e collegarlo alla scadenza'))
  FROM (SELECT DISTINCT ON (cc.id) cc.id cost_id,cc.name,cc.amount,sc.id sc_id,sc.description,round(sc.amount-coalesce(sc.paid_amount,0),2) residuo
        FROM public.company_costs cc
        LEFT JOIN public.bank_transactions bt ON bt.company_id=cc.company_id AND bt.id=private.tes_uuid(substring(cc.notes FROM '^\[BANCA:([0-9a-fA-F-]{36})\]'))
        JOIN public.scadenze sc ON sc.company_id=cc.company_id AND sc.direction='uscita' AND sc.status IN('da_pagare','parziale')
         AND coalesce(sc.is_previsionale,false)=false AND sc.amount-coalesce(sc.paid_amount,0)>=cc.amount-0.005 AND (sc.cost_id IS NULL OR sc.cost_id<>cc.id)
        LEFT JOIN public.suppliers f ON f.id=sc.supplier_id AND f.company_id=sc.company_id
        WHERE cc.company_id=p_company AND coalesce(cc.senza_fattura,false) AND coalesce(cc.notes,'')~'^\[BANCA:'
         AND ((cc.supplier_id IS NOT NULL AND sc.supplier_id=cc.supplier_id)
          OR (sc.supplier_id IS NOT NULL AND coalesce(private.tes_iban(bt.creditor_iban),private.tes_iban(to_jsonb(bt)->>'counterparty_iban')) IS NOT NULL
              AND (private.tes_iban(to_jsonb(f)->>'iban')=coalesce(private.tes_iban(bt.creditor_iban),private.tes_iban(to_jsonb(bt)->>'counterparty_iban'))
               OR EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id=sc.supplier_id AND v.confermato
                          AND private.tes_iban(v.iban)=coalesce(private.tes_iban(bt.creditor_iban),private.tes_iban(to_jsonb(bt)->>'counterparty_iban'))))))
        ORDER BY cc.id,abs(sc.amount-coalesce(sc.paid_amount,0)-cc.amount),sc.id) x),'[]');
 -- 4. Previsione aperta con una scadenza reale dello stesso fornitore e commessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','previsione_non_sostituita','ids',jsonb_build_array(p.id)||to_jsonb(r.ids),'importo',p.amount-coalesce(p.paid_amount,0),
   'descrizione',format('Previsione «%s» ancora aperta: ci sono %s scadenze reali dello stesso fornitore',p.description,cardinality(r.ids)),
   'cosa_fare',CASE WHEN EXISTS(SELECT 1 FROM public.scadenze_sostituzioni z WHERE z.previsione_id=p.id AND z.stato='proposta' AND z.annullato_at IS NULL)
                    THEN 'Confermare la sostituzione proposta (il collegamento automatico è spento)' ELSE 'Sostituire la previsione con la scadenza reale' END))
  FROM public.scadenze p CROSS JOIN LATERAL (SELECT ARRAY(SELECT x.id FROM public.scadenze x WHERE x.company_id=p.company_id AND NOT coalesce(x.is_previsionale,false)
     AND x.direction=p.direction AND x.supplier_id=p.supplier_id AND x.order_id IS NOT DISTINCT FROM p.order_id AND x.status<>'annullata'
     AND NOT EXISTS(SELECT 1 FROM public.scadenze_sostituzioni z WHERE z.previsione_id=p.id AND z.reale_id=x.id AND z.annullato_at IS NULL AND z.stato='applicata')) ids) r
  WHERE p.company_id=p_company AND coalesce(p.is_previsionale,false) AND p.status IN('da_pagare','parziale') AND p.supplier_id IS NOT NULL AND cardinality(r.ids)>0),'[]');
 -- 5. Prima nota doppia sullo stesso movimento e documento
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','prima_nota_doppia','ids',to_jsonb(g.ids),'importo',g.s,
   'descrizione',format('%s registrazioni di prima nota per lo stesso movimento e documento',cardinality(g.ids)),'cosa_fare','Stornare la registrazione in più'))
  FROM (SELECT array_agg(pn.id ORDER BY pn.id) ids,sum(pn.amount) s FROM public.prima_nota_entries pn
   WHERE pn.company_id=p_company AND pn.bank_transaction_id IS NOT NULL AND pn.reversal_of IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=p_company AND r.reversal_of=pn.id)
   GROUP BY pn.bank_transaction_id,coalesce(pn.documento_fiscale_id,pn.invoice_id,pn.scadenza_id,pn.cost_id) HAVING count(*)>1 AND coalesce(pn.documento_fiscale_id,pn.invoice_id,pn.scadenza_id,pn.cost_id) IS NOT NULL) g),'[]');
 -- 6. Ripartizioni dei costi su commesse che non fanno 100%
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','allocazioni_non_100','ids',jsonb_build_array(cc.id),'importo',cc.amount,
   'descrizione',format('Costo «%s» ripartito al %s%%',cc.name,a.pct),'cosa_fare','Completare la ripartizione: la parte mancante non va su nessuna commessa'))
  FROM public.company_costs cc CROSS JOIN LATERAL (SELECT round(sum(CASE WHEN x->>'pct'~'^[0-9]+(\.[0-9]+)?$' THEN (x->>'pct')::numeric ELSE 0 END),2) pct FROM jsonb_array_elements(cc.allocations) x) a
  WHERE cc.company_id=p_company AND jsonb_typeof(cc.allocations)='array' AND jsonb_array_length(cc.allocations)>0 AND abs(a.pct-100)>0.01),'[]');
 -- 7. Fattura su un ordine e, col suo costo, anche direttamente sulla commessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','fattura_su_ordine_e_su_commessa','ids',jsonb_build_array(fr.id,cc.id),'importo',cc.amount,
   'descrizione',format('Fattura %s collegata a un ordine, ma il suo costo (%s €) sta sulla commessa senza l''ordine',fr.numero_fattura,cc.amount),
   'cosa_fare','Collegare il costo all''ordine: altrimenti la commessa lo conta due volte'))
  FROM public.fatture_ricevute fr JOIN public.company_costs cc ON cc.id=fr.company_cost_id AND cc.company_id=fr.company_id
  WHERE fr.company_id=p_company AND cc.purchase_order_id IS NULL
   AND (cc.order_id IS NOT NULL OR (jsonb_typeof(cc.allocations)='array' AND jsonb_array_length(cc.allocations)>0))
   AND (fr.purchase_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.fattura_ricevuta_ordini q WHERE q.company_id=fr.company_id AND q.fattura_id=fr.id))),'[]');
 -- 8. Scadenze aperte e rate fornitore aperte sullo stesso costo
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','scadenza_e_rata_sullo_stesso_costo','ids',jsonb_build_array(x.cost_id),'importo',x.sovrapposto,
   'descrizione',format('Costo con %s € in scadenze aperte e %s € in rate fornitore aperte',x.s_aperto,x.r_aperto),
   'cosa_fare','Tenere un solo calendario: la cassa prevista usa le scadenze e ignora le rate'))
  FROM (SELECT s.cost_id,s.aperto s_aperto,r.aperto r_aperto,least(s.aperto,r.aperto) sovrapposto
        FROM (SELECT cost_id,round(sum(amount-coalesce(paid_amount,0)),2) aperto FROM public.scadenze WHERE company_id=p_company AND cost_id IS NOT NULL AND direction='uscita' AND status IN('da_pagare','parziale') GROUP BY 1) s
        JOIN (SELECT company_cost_id cost_id,round(sum(importo),2) aperto FROM public.rate_fornitori WHERE company_id=p_company AND company_cost_id IS NOT NULL AND stato='da_pagare' GROUP BY 1) r USING (cost_id)) x),'[]');
 RETURN out;
END $fn$;
REVOKE ALL ON FUNCTION public.cdg_controllo_doppi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cdg_controllo_doppi(uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
