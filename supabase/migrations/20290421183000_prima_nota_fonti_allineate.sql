-- Una fonte finanziaria si rappresenta una volta sola. Nessun nuovo pagamento
-- viene creato da questo ponte: i pagamenti dei documenti restano la fonte.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.prima_nota_entries ADD COLUMN IF NOT EXISTS invoice_payment_id uuid REFERENCES public.invoice_payments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prima_nota_invoice_payment_unico ON public.prima_nota_entries(invoice_payment_id) WHERE invoice_payment_id IS NOT NULL;

-- Collegare la prova già approvata alla SUA banca non equivale a modificarne
-- il pagamento. Il controllo precedente annullava anche questo collegamento.
CREATE OR REPLACE FUNCTION private.bank_proof_payment_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE original uuid; co uuid; source_tx uuid; reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    original:=NEW.reversal_of; co:=NEW.company_id; reason:='Pagamento originario stornato';
    IF original IS NULL THEN RETURN NEW; END IF;
  ELSIF TG_OP='DELETE' THEN
    original:=OLD.id;co:=OLD.company_id;reason:='Pagamento originario rimosso';
  ELSE
    IF NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.direction IS NOT DISTINCT FROM OLD.direction
       AND NEW.bank_transaction_id IS NOT DISTINCT FROM OLD.bank_transaction_id THEN RETURN NEW; END IF;
    original:=OLD.id;co:=OLD.company_id;reason:='Pagamento o prova bancaria modificati';
  END IF;
  SELECT transaction_id INTO source_tx FROM public.bank_reconciliations
    WHERE company_id=co AND prima_nota_id=original AND unmatched_at IS NULL LIMIT 1;
  IF source_tx IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND OLD.bank_transaction_id IS NULL AND NEW.bank_transaction_id=source_tx
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.direction IS NOT DISTINCT FROM OLD.direction THEN
    RETURN NEW;
  END IF;
  UPDATE public.bank_reconciliations SET unmatched_at=now(),unmatch_reason=reason,
    prima_nota_id=CASE WHEN TG_OP='DELETE' THEN NULL ELSE prima_nota_id END
    WHERE company_id=co AND prima_nota_id=original AND unmatched_at IS NULL;
  IF TG_OP='INSERT' THEN
    UPDATE public.prima_nota_entries SET bank_transaction_id=NULL WHERE id=original AND company_id=co AND bank_transaction_id=source_tx;
  ELSIF TG_OP='UPDATE' AND NEW.bank_transaction_id=source_tx THEN NEW.bank_transaction_id:=NULL;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $function$;
REVOKE ALL ON FUNCTION private.bank_proof_payment_lifecycle() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.prima_nota_pagamento_stessa_azienda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
BEGIN
  IF NEW.invoice_payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoice_payments p
       WHERE p.id=NEW.invoice_payment_id AND p.company_id=NEW.company_id AND p.invoice_id=NEW.invoice_id
         AND abs(p.amount)=NEW.amount AND p.payment_date=NEW.entry_date) THEN
    RAISE EXCEPTION 'Il pagamento non corrisponde a questa registrazione e azienda' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS a_prima_nota_pagamento_stessa_azienda ON public.prima_nota_entries;
CREATE TRIGGER a_prima_nota_pagamento_stessa_azienda BEFORE INSERT OR UPDATE OF invoice_payment_id,invoice_id,company_id,amount,entry_date ON public.prima_nota_entries
  FOR EACH ROW EXECUTE FUNCTION private.prima_nota_pagamento_stessa_azienda();
REVOKE ALL ON FUNCTION private.prima_nota_pagamento_stessa_azienda() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.prima_nota_allinea_banca(p_transazione uuid,p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
DECLARE t public.bank_transactions; v_tot numeric; v_somma numeric; v_n integer; v_rec integer;
  v_candidati uuid[]; v_pn uuid; v_qualsiasi integer; v_collegato numeric; v_atteso numeric; v_quote uuid[];
BEGIN
  SELECT * INTO t FROM public.bank_transactions WHERE id=p_transazione;
  IF NOT FOUND THEN RETURN jsonb_build_object('esito','non_presente'); END IF;
  IF NOT p_anteprima THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(t.company_id::text,2810));
    SELECT * INTO t FROM public.bank_transactions WHERE id=p_transazione FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN jsonb_build_object('esito','in_aggiornamento','id',p_transazione); END IF;
  END IF;
  IF t.reconciliation_status<>'reconciled' THEN RETURN jsonb_build_object('esito','da_riconciliare'); END IF;
  v_tot:=round(CASE WHEN coalesce(t.currency,'EUR')='EUR' THEN t.amount ELSE t.amount_eur END,2);
  IF v_tot IS NULL OR v_tot=0 THEN RETURN jsonb_build_object('esito','da_verificare','motivo','Importo in euro non disponibile','id',t.id); END IF;
  IF coalesce(t.booking_date,t.value_date) IS NULL THEN RETURN jsonb_build_object('esito','da_verificare','motivo','Movimento bancario senza data effettiva','id',t.id); END IF;
  SELECT count(*),coalesce(sum(CASE WHEN direction='entrata' THEN amount ELSE -amount END),0)
    INTO v_n,v_somma FROM public.prima_nota_entries WHERE company_id=t.company_id AND bank_transaction_id=t.id;
  IF v_n>0 AND abs(v_somma-v_tot)<0.005 THEN RETURN jsonb_build_object('esito','allineato','id',t.id); END IF;
  v_collegato:=v_somma;
  IF v_n>0 AND (v_somma*v_tot<0 OR abs(v_somma)>=abs(v_tot)) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','Il totale in prima nota differisce dal movimento bancario');
  END IF;
  v_atteso:=abs(v_tot)-abs(v_collegato);
  SELECT count(*),coalesce(sum(matched_amount),0) INTO v_rec,v_somma FROM public.bank_reconciliations
    WHERE company_id=t.company_id AND transaction_id=t.id AND unmatched_at IS NULL;
  IF (v_rec=0 AND t.chiuso_senza_documento IS NULL) OR (v_rec>0 AND abs(v_somma-abs(t.amount))>=0.005) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','La riconciliazione non ha quote complete e verificabili');
  END IF;
  IF coalesce(t.currency,'EUR')<>'EUR' AND v_rec>0 THEN
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','Verifica il cambio e le quote dei documenti in valuta');
  END IF;
  SELECT array_agg(r.id) INTO v_quote FROM public.bank_reconciliations r
    WHERE r.company_id=t.company_id AND r.transaction_id=t.id AND r.unmatched_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.company_id=t.company_id AND p.bank_transaction_id=t.id
        AND (p.id=r.prima_nota_id OR p.movimento_id=r.movimento_id OR p.invoice_id=r.invoice_id
             OR p.documento_fiscale_id=r.documento_id OR (p.payment_payload->'bank_reconciliation_ids') ? r.id::text));
  IF v_collegato<>0 AND (coalesce(cardinality(v_quote),0)=0 OR abs(v_atteso-(SELECT coalesce(sum(matched_amount),0)
        FROM public.bank_reconciliations WHERE id=ANY(v_quote)))>=0.005) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','Le quote già rappresentate in prima nota non corrispondono ai documenti collegati');
  END IF;
  IF v_collegato<>0 THEN v_rec:=cardinality(v_quote); END IF;
  -- Le prove di un pagamento già registrato si collegano, non si ricopiano.
  WITH candidati AS (
    SELECT DISTINCT p.id,p.amount,r.id AS quota
      FROM public.bank_reconciliations r JOIN public.prima_nota_entries p ON p.company_id=r.company_id
        AND (p.id=r.prima_nota_id OR p.invoice_id=r.invoice_id OR p.documento_fiscale_id=r.documento_id
          OR p.movimento_id=r.movimento_id OR p.scadenza_id=r.scadenza_id
          OR p.cost_id=(SELECT f.company_cost_id FROM public.fatture_ricevute f WHERE f.id=r.fattura_ricevuta_id AND f.company_id=r.company_id))
     WHERE r.company_id=t.company_id AND r.transaction_id=t.id AND r.unmatched_at IS NULL
       AND (v_collegato=0 OR r.id=ANY(v_quote))
       AND p.bank_transaction_id IS NULL AND p.reversal_of IS NULL
       AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries x WHERE x.company_id=p.company_id AND x.reversal_of=p.id)
       AND p.direction=CASE WHEN v_tot>0 THEN 'entrata' ELSE 'uscita' END
  ), precisi AS (
    SELECT c.* FROM candidati c JOIN public.prima_nota_entries p ON p.id=c.id
      JOIN public.bank_reconciliations r ON r.id=c.quota
     WHERE abs(p.amount-r.matched_amount)<0.005 AND abs(p.entry_date-t.booking_date)<=7
       AND (nullif(to_jsonb(p)->>'bank_account_id','') IS NULL OR to_jsonb(p)->>'bank_account_id'=to_jsonb(t)->>'account_id')
       AND (SELECT count(*) FROM candidati cc WHERE cc.quota=c.quota)=1
  ) SELECT (SELECT count(*) FROM candidati),array_agg(DISTINCT id),count(DISTINCT quota),coalesce(sum(amount),0)
      INTO v_qualsiasi,v_candidati,v_n,v_somma FROM precisi;
  IF v_qualsiasi>0 THEN
    IF v_n=v_rec AND abs(v_somma-v_atteso)<0.005 AND cardinality(v_candidati)=v_n THEN
      IF NOT p_anteprima THEN
        UPDATE public.prima_nota_entries SET bank_transaction_id=t.id,account_label='banca'
          WHERE id=ANY(v_candidati) AND company_id=t.company_id AND bank_transaction_id IS NULL;
      END IF;
      RETURN jsonb_build_object('esito','collegabile','id',t.id,'registrazioni',v_candidati);
    END IF;
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','Esistono pagamenti del documento con importi, date o collegamenti da verificare');
  END IF;
  IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=t.company_id AND n.bank_transaction_id IS NULL
      AND NOT n.is_auto AND n.reversal_of IS NULL AND n.invoice_id IS NULL AND n.documento_fiscale_id IS NULL AND n.cost_id IS NULL
      AND (n.account_label='banca' OR nullif(to_jsonb(n)->>'bank_account_id','') IS NOT NULL OR nullif(to_jsonb(n)->>'conto_liquidita_id','') IS NOT NULL)
      AND abs(n.amount-v_atteso)<0.005 AND abs(n.entry_date-t.booking_date)<=3
      AND n.direction=CASE WHEN v_tot>0 THEN 'entrata' ELSE 'uscita' END) THEN
    RETURN jsonb_build_object('esito','da_verificare','id',t.id,'motivo','Una registrazione bancaria manuale potrebbe già rappresentare questo movimento');
  END IF;
  IF NOT p_anteprima THEN
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,
      bank_transaction_id,account_label,is_auto,auto_source,created_by,payment_payload)
    VALUES(t.company_id,CASE WHEN v_tot>0 THEN 'entrata' ELSE 'uscita' END,
      CASE WHEN t.chiuso_senza_documento IS NOT NULL THEN 'altro' WHEN v_tot>0 THEN 'incasso' ELSE 'fornitore' END,
      left(coalesce(nullif(btrim(t.description),''),'Movimento bancario'),255),v_atteso,coalesce(t.booking_date,t.value_date),
      CASE WHEN coalesce(t.description,'') ~* '\m(RID|SDD)\M|addebito diretto' THEN 'rid'
           WHEN coalesce(t.description,'') ~* '\m(POS|CARTA)\M' THEN 'carta'
           WHEN coalesce(t.description,'') ~* 'bonifico' THEN 'bonifico' ELSE 'altro' END,
      t.id,'banca',true,'bank_alignment',auth.uid(),jsonb_build_object('origine','bank_transactions','transaction_id',t.id,'bank_reconciliation_ids',to_jsonb(coalesce(v_quote,'{}'::uuid[])))) RETURNING id INTO v_pn;
  END IF;
  RETURN jsonb_build_object('esito','inseribile','id',t.id,'prima_nota_id',v_pn,'importo',v_atteso);
END $function$;

CREATE OR REPLACE FUNCTION private.prima_nota_allinea_incasso(p_pagamento uuid,p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
DECLARE p public.invoice_payments; i public.invoices; v_pn uuid; v_n integer; v_rec uuid; v_direzione text; v_somma numeric;
BEGIN
  SELECT * INTO p FROM public.invoice_payments WHERE id=p_pagamento;
  IF NOT FOUND THEN RETURN jsonb_build_object('esito','non_presente'); END IF;
  SELECT * INTO i FROM public.invoices WHERE id=p.invoice_id AND company_id=p.company_id;
  IF NOT FOUND OR i.deleted_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.documenti_fiscali WHERE id=i.id AND company_id=p.company_id) THEN
    RETURN jsonb_build_object('esito','altra_fonte');
  END IF;
  IF NOT p_anteprima THEN
    SELECT * INTO p FROM public.invoice_payments WHERE id=p_pagamento FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN jsonb_build_object('esito','in_aggiornamento','id',p_pagamento); END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p.company_id::text,2810));
  END IF;
  IF coalesce(p.amount,0)=0 THEN RETURN jsonb_build_object('esito','altra_fonte'); END IF;
  IF p.payment_date IS NULL THEN RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Data effettiva del pagamento non disponibile'); END IF;
  IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE company_id=p.company_id AND invoice_payment_id=p.id) THEN
    RETURN jsonb_build_object('esito','allineato');
  END IF;
  IF p.reference LIKE 'prima_nota:%' THEN
    IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.id::text=substring(p.reference FROM 12)
              AND n.invoice_id=p.invoice_id AND abs(n.amount-abs(p.amount))<0.005) THEN RETURN jsonb_build_object('esito','allineato'); END IF;
    RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Il pagamento indica una prima nota non più corrispondente');
  END IF;
  IF p.reference LIKE 'recon:%' THEN
    SELECT transaction_id INTO v_rec FROM public.bank_reconciliations WHERE company_id=p.company_id AND id::text=substring(p.reference FROM 7) AND unmatched_at IS NULL;
    IF v_rec IS NULL THEN RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Riconciliazione del pagamento non più attiva'); END IF;
    RETURN private.prima_nota_allinea_banca(v_rec,p_anteprima)||jsonb_build_object('origine','banca');
  END IF;
  v_direzione:=CASE WHEN p.amount<0 OR i.document_type IN('credit_note','TD04','TD08') THEN 'uscita' ELSE 'entrata' END;
  SELECT count(*),min(n.id::text)::uuid INTO v_n,v_pn FROM public.prima_nota_entries n
    WHERE n.company_id=p.company_id AND n.invoice_id=p.invoice_id AND n.invoice_payment_id IS NULL
      AND n.direction=v_direzione AND n.entry_date=p.payment_date AND abs(n.amount-abs(p.amount))<0.005
      AND n.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries x WHERE x.reversal_of=n.id AND x.company_id=p.company_id);
  IF v_n=1 THEN
    -- Una corrispondenza di data/importo non identifica una rata se ne esistono
    -- altre uguali: in quel caso serve il riferimento esplicito.
    IF (SELECT count(*) FROM public.invoice_payments x WHERE x.invoice_id=p.invoice_id AND x.company_id=p.company_id
         AND x.payment_date=p.payment_date AND x.amount=p.amount)>1 THEN
      RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Più pagamenti con la stessa data e lo stesso importo');
    END IF;
    IF NOT p_anteprima AND EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE id=v_pn AND is_auto AND auto_source='invoice_payment') THEN
      UPDATE public.prima_nota_entries SET invoice_payment_id=p.id WHERE id=v_pn;
    END IF;
    RETURN jsonb_build_object('esito','allineato');
  ELSIF v_n>1 THEN RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Più registrazioni di prima nota corrispondono al pagamento'); END IF;
  SELECT coalesce(sum(n.amount),0) INTO v_somma FROM public.prima_nota_entries n WHERE n.company_id=p.company_id AND n.invoice_id=p.invoice_id
    AND n.auto_source='invoice' AND n.reversal_of IS NULL;
  IF v_somma>0 THEN
    IF abs(v_somma-(SELECT coalesce(sum(abs(x.amount)),0) FROM public.invoice_payments x WHERE x.company_id=p.company_id AND x.invoice_id=p.invoice_id))<0.005 THEN
      RETURN jsonb_build_object('esito','allineato');
    END IF;
    RETURN jsonb_build_object('esito','da_verificare','id',p.id,'motivo','Incasso storico riepilogativo da confrontare con le singole rate');
  END IF;
  IF NOT p_anteprima THEN
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,
      invoice_id,invoice_payment_id,account_label,is_auto,auto_source,created_by,reference_number)
    VALUES(p.company_id,v_direzione,CASE WHEN v_direzione='entrata' THEN 'incasso' ELSE 'altro' END,
      left((CASE WHEN v_direzione='entrata' THEN 'Incasso fattura ' ELSE 'Rimborso nota di credito ' END)||coalesce(i.invoice_number,'')
        ||coalesce(' · '||nullif(i.client_company_name,''),''),255),abs(p.amount),p.payment_date,p.payment_method,
      p.invoice_id,p.id,CASE WHEN p.payment_method IN('contanti','cash','MP01') THEN 'cassa' ELSE 'banca' END,true,'invoice_payment',p.created_by,p.reference);
  END IF;
  RETURN jsonb_build_object('esito','inseribile','id',p.id);
END $function$;

CREATE OR REPLACE FUNCTION public.prima_nota_allinea_fonti(p_company uuid,p_anteprima boolean DEFAULT true,p_origine text DEFAULT 'both')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' SET statement_timeout TO '60s' SET lock_timeout TO '3s' AS $function$
DECLARE x record; v jsonb; v_banca integer:=0; v_fatture integer:=0; v_link integer:=0; v_casi jsonb:='[]'; v_n integer:=0; v_limite integer; v_visti uuid[]:='{}';
BEGIN
  IF NOT public.user_can_access_company(p_company) OR auth.uid() IS NULL OR public.utente_bloccato() OR public.utente_sola_lettura(p_company)
     OR (NOT public.contabilita_puo_scrivere(p_company) AND NOT (public.puo_incassare_fatture(p_company) AND public.puo_gestire_scadenze(p_company))) THEN
    RAISE EXCEPTION 'Non hai il permesso di riallineare la prima nota' USING ERRCODE='42501';
  END IF;
  IF p_origine NOT IN('both','from_banking','from_invoices') THEN RAISE EXCEPTION 'Origine non valida' USING ERRCODE='22023'; END IF;
  v_limite:=CASE WHEN p_anteprima THEN 1000 ELSE 50 END;
  IF p_origine IN('both','from_banking') THEN
    FOR x IN SELECT b.id FROM public.bank_transactions b WHERE b.company_id=p_company AND b.reconciliation_status='reconciled'
      AND (NOT EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p_company AND n.bank_transaction_id=b.id)
        OR abs((SELECT coalesce(sum(CASE WHEN n.direction='entrata' THEN n.amount ELSE -n.amount END),0) FROM public.prima_nota_entries n
             WHERE n.company_id=p_company AND n.bank_transaction_id=b.id)-coalesce(CASE WHEN coalesce(b.currency,'EUR')='EUR' THEN b.amount ELSE b.amount_eur END,0))>=0.005)
      ORDER BY b.booking_date,b.id LIMIT 1000 LOOP
      v:=private.prima_nota_allinea_banca(x.id,p_anteprima)||jsonb_build_object('origine','banca');
      v_visti:=array_append(v_visti,x.id);
      IF v->>'esito'='inseribile' THEN v_banca:=v_banca+1; v_n:=v_n+1;
      ELSIF v->>'esito'='collegabile' THEN v_link:=v_link+1; v_n:=v_n+1;
      ELSIF v->>'esito'='da_verificare' THEN v_casi:=v_casi||v; END IF;
      EXIT WHEN v_n>=v_limite;
    END LOOP;
  END IF;
  IF p_origine IN('both','from_invoices') AND v_n<v_limite THEN
    FOR x IN SELECT p.id,p.invoice_id FROM public.invoice_payments p WHERE p.company_id=p_company
      AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p_company AND n.invoice_payment_id=p.id)
      ORDER BY p.payment_date,p.id LIMIT 1000 LOOP
      v:=private.prima_nota_allinea_incasso(x.id,p_anteprima)||jsonb_build_object('invoice_id',x.invoice_id);
      IF p_anteprima AND v->>'id' IS NOT NULL AND (v->>'id')::uuid=ANY(v_visti) THEN CONTINUE; END IF;
      IF v->>'id' IS NOT NULL THEN v_visti:=array_append(v_visti,(v->>'id')::uuid); END IF;
      IF v->>'esito'='inseribile' THEN v_fatture:=v_fatture+1; v_n:=v_n+1;
      ELSIF v->>'esito'='collegabile' THEN v_link:=v_link+1; v_n:=v_n+1;
      ELSIF v->>'esito'='da_verificare' THEN v_casi:=v_casi||v; END IF;
      EXIT WHEN v_n>=v_limite;
    END LOOP;
  END IF;
  -- Alcuni gestionali importano il saldo della fattura senza il dettaglio dei
  -- versamenti. Si usa solo un saldo e una data effettivi, mai totale/scadenza
  -- presunti, e soltanto quando nessun registro pagamenti o banca lo racconta già.
  IF p_origine IN('both','from_invoices') AND v_n<v_limite THEN
    FOR x IN SELECT i.* FROM public.invoices i WHERE i.company_id=p_company AND i.deleted_at IS NULL
      AND i.external_provider IS NOT NULL AND coalesce(i.paid_amount,0)>0
      AND NOT EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=i.id AND d.company_id=p_company)
      AND NOT EXISTS(SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id=i.id AND p.company_id=p_company)
      AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.invoice_id=i.id AND n.company_id=p_company)
      AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.invoice_id=i.id AND r.company_id=p_company AND r.unmatched_at IS NULL)
      ORDER BY i.payment_date NULLS LAST,i.id LIMIT 1000 LOOP
      IF x.payment_date IS NULL THEN
        v_casi:=v_casi||jsonb_build_object('esito','da_verificare','id',x.id,'origine','fattura','invoice_id',x.id,'motivo','La fattura importata risulta incassata ma non indica la data effettiva del pagamento');
        CONTINUE;
      END IF;
      IF NOT p_anteprima THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,2810));
        SELECT * INTO x FROM public.invoices WHERE id=x.id AND company_id=p_company FOR UPDATE SKIP LOCKED;
        IF NOT FOUND OR x.deleted_at IS NOT NULL OR coalesce(x.paid_amount,0)<=0 OR x.payment_date IS NULL THEN CONTINUE; END IF;
        IF EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE invoice_id=x.id AND company_id=p_company)
           OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE invoice_id=x.id AND company_id=p_company)
           OR EXISTS(SELECT 1 FROM public.bank_reconciliations WHERE invoice_id=x.id AND company_id=p_company AND unmatched_at IS NULL) THEN CONTINUE; END IF;
        INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,invoice_id,is_auto,auto_source,created_by)
          VALUES(p_company,CASE WHEN x.document_type IN('credit_note','TD04','TD08') THEN 'uscita' ELSE 'entrata' END,'incasso',
            left('Incasso fattura '||coalesce(x.invoice_number,'')||coalesce(' · '||nullif(x.client_company_name,''),''),255),
            x.paid_amount,x.payment_date,x.id,true,'invoice',auth.uid());
      END IF;
      v_fatture:=v_fatture+1;v_n:=v_n+1;EXIT WHEN v_n>=v_limite;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('imported_banking',v_banca,'imported_invoices',v_fatture,'linked_existing',v_link,
    'total',v_banca+v_fatture,'da_verificare',v_casi,'anteprima',p_anteprima,'limite_raggiunto',v_n>=v_limite);
END $function$;

CREATE OR REPLACE FUNCTION private.prima_nota_ponte_banca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
BEGIN
  IF NEW.reconciliation_status='reconciled' THEN PERFORM private.prima_nota_allinea_banca(NEW.id,false); END IF;
  IF NEW.reconciliation_status<>'reconciled' AND NEW.chiuso_senza_documento IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations WHERE company_id=NEW.company_id AND transaction_id=NEW.id AND unmatched_at IS NULL) THEN
    DELETE FROM public.prima_nota_entries WHERE company_id=NEW.company_id AND bank_transaction_id=NEW.id AND auto_source='bank_alignment';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS z_prima_nota_ponte_banca ON public.bank_transactions;
CREATE TRIGGER z_prima_nota_ponte_banca AFTER INSERT OR UPDATE OF reconciliation_status,chiuso_senza_documento ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION private.prima_nota_ponte_banca();

CREATE OR REPLACE FUNCTION private.prima_nota_ponte_pagamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
DECLARE i public.invoices;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.prima_nota_entries WHERE company_id=OLD.company_id AND invoice_payment_id=OLD.id AND auto_source='invoice_payment';
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT * INTO i FROM public.invoices WHERE id=NEW.invoice_id AND company_id=NEW.company_id;
    IF FOUND AND i.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.documenti_fiscali WHERE id=i.id AND company_id=i.company_id) AND NEW.amount<>0 THEN
      UPDATE public.prima_nota_entries SET invoice_id=NEW.invoice_id,amount=abs(NEW.amount),entry_date=NEW.payment_date,
        payment_method=NEW.payment_method,reference_number=NEW.reference,
        direction=CASE WHEN NEW.amount<0 OR i.document_type IN('credit_note','TD04','TD08') THEN 'uscita' ELSE 'entrata' END
        WHERE company_id=NEW.company_id AND invoice_payment_id=NEW.id AND auto_source='invoice_payment';
      IF FOUND THEN RETURN NEW; END IF;
    ELSE
      DELETE FROM public.prima_nota_entries WHERE company_id=OLD.company_id AND invoice_payment_id=OLD.id AND auto_source='invoice_payment';
    END IF;
  END IF;
  PERFORM private.prima_nota_allinea_incasso(NEW.id,false);
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS z_prima_nota_ponte_pagamento ON public.invoice_payments;
CREATE TRIGGER z_prima_nota_ponte_pagamento AFTER INSERT OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION private.prima_nota_ponte_pagamento();
DROP TRIGGER IF EXISTS z_prima_nota_ponte_pagamento_elimina ON public.invoice_payments;
CREATE TRIGGER z_prima_nota_ponte_pagamento_elimina BEFORE DELETE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION private.prima_nota_ponte_pagamento();

REVOKE ALL ON FUNCTION private.prima_nota_allinea_banca(uuid,boolean),private.prima_nota_allinea_incasso(uuid,boolean),private.prima_nota_ponte_banca(),private.prima_nota_ponte_pagamento() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prima_nota_allinea_fonti(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_allinea_fonti(uuid,boolean,text) TO authenticated;
