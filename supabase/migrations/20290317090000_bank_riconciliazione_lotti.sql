SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- A candidate is evidence, never an instruction to register money.
CREATE OR REPLACE FUNCTION public.bank_proposte_movimento(p_company uuid,p_tx uuid,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions; c jsonb; result jsonb:='[]'; party text; iban text; docdate date; title text; normparty text; normbank text; normtitle text; why jsonb; warnings jsonb; score int; exact_amount boolean; party_ok boolean; iban_ok boolean; number_ok boolean; old_match boolean; remaining numeric;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 remaining:=(private.bank_movimento_links(p_company,p_tx)->>'remaining')::numeric;
 FOR c IN SELECT value FROM jsonb_array_elements(public.bank_candidati_movimento(p_company,p_tx,p_search,false)) LOOP
  party:=NULL;iban:=NULL;docdate:=NULL;
  IF c->>'tipo' IN('documento','invoice') THEN
   SELECT coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome')),
    coalesce(d.cliente_snapshot->>'iban',d.cliente_snapshot->>'iban_bancario'),d.data_scadenza INTO party,iban,docdate
   FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=(c->>'id')::uuid AND d.company_id=p_company;
  ELSE
   SELECT f.name,coalesce(to_jsonb(f)->>'iban',to_jsonb(f)->>'bank_iban'),s.due_date INTO party,iban,docdate
   FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id WHERE s.id=(c->>'id')::uuid AND s.company_id=p_company;
  END IF;
  normparty:=lower(regexp_replace(coalesce(party,''),'[^[:alnum:]]','','g'));
  normbank:=lower(regexp_replace(concat_ws(' ',t.description,t.debtor_name,t.creditor_name),'[^[:alnum:]]','','g'));
  title:=c->>'titolo';normtitle:=lower(regexp_replace(coalesce(title,''),'[^[:alnum:]]','','g'));
  exact_amount:=abs((c->>'residuo')::numeric-remaining)<0.005;
  party_ok:=length(normparty)>=5 AND strpos(normbank,normparty)>0;
  iban_ok:=length(regexp_replace(coalesce(iban,''),'\s','','g'))>=15 AND upper(regexp_replace(iban,'\s','','g'))=upper(regexp_replace(coalesce(CASE WHEN t.transaction_type='credit' THEN t.debtor_iban ELSE t.creditor_iban END,''),'\s','','g'));
  -- Full document identifiers, not a short digit occurring inside an IBAN.
  number_ok:=length(normtitle)>=5 AND normtitle~'[0-9]' AND strpos(lower(regexp_replace(coalesce(t.description,''),'[^[:alnum:]]','','g')),normtitle)>0;
  why:='[]';warnings:='[]';score:=0;
  IF exact_amount THEN why:=why||'"Importo uguale al residuo"'::jsonb;score:=score+30;ELSE warnings:=warnings||'"Importo diverso dal residuo: verifica acconto, cumulativo o differenza"'::jsonb;END IF;
  IF party_ok THEN why:=why||'"Controparte corrispondente"'::jsonb;score:=score+25;END IF;
  IF iban_ok THEN why:=why||'"IBAN della controparte corrispondente"'::jsonb;score:=score+35;
  ELSIF nullif(iban,'') IS NOT NULL AND nullif(CASE WHEN t.transaction_type='credit' THEN t.debtor_iban ELSE t.creditor_iban END,'') IS NOT NULL THEN warnings:=warnings||'"IBAN diverso da quello del documento"'::jsonb;END IF;
  IF number_ok THEN why:=why||'"Numero documento nella causale"'::jsonb;score:=score+35;END IF;
  IF docdate IS NOT NULL AND t.booking_date IS NOT NULL THEN
   IF abs(t.booking_date-docdate)<=30 THEN why:=why||'"Data entro 30 giorni dalla scadenza"'::jsonb;score:=score+10;
   ELSIF abs(t.booking_date-docdate)>120 THEN warnings:=warnings||'"Data distante oltre 120 giorni dalla scadenza"'::jsonb;END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.unmatched_at IS NOT NULL AND ((c->>'id')::uuid IN(r.invoice_id,r.documento_id,r.scadenza_id) OR r.payment_source->>'documento_id'=c->>'id' OR r.payment_source->>'invoice_id'=c->>'id' OR r.payment_source->>'scadenza_id'=c->>'id')) INTO old_match;
  IF old_match OR t.proposta_rifiutata_at IS NOT NULL THEN warnings:=warnings||'"Proposta già scartata o abbinamento annullato: verifica manuale"'::jsonb;END IF;
  result:=result||jsonb_build_array(c||jsonb_build_object('motivi',why,'incongruenze',warnings,'punteggio',least(score,100),'forte',exact_amount AND jsonb_array_length(warnings)=0 AND ((party_ok AND number_ok) OR (iban_ok AND (party_ok OR number_ok))),'data',docdate,'controparte',party));
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(value ORDER BY (value->>'forte')::boolean DESC,(value->>'punteggio')::int DESC,value->>'key') FROM jsonb_array_elements(result)),'[]');
END $$;
REVOKE ALL ON FUNCTION public.bank_proposte_movimento(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_proposte_movimento(uuid,uuid,text) TO authenticated;

-- Adjustment payments are traced separately so unlinking can reverse only payments created here.
CREATE TABLE IF NOT EXISTS private.bank_adjustment_payments(prima_nota_id uuid PRIMARY KEY,company_id uuid NOT NULL,cost_id uuid NOT NULL,transaction_id uuid NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),reversed_at timestamptz);
ALTER TABLE private.bank_adjustment_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bank_adjustment_payments FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bank_register_difference(p_company uuid,p_tx uuid,p_amount numeric,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions; cost uuid; payment jsonb; pn uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF t.id IS NULL OR t.transaction_type<>'debit' OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_reason NOT IN('commissioni','arrotondamento') THEN RAISE EXCEPTION 'Differenza non compatibile: verifica il trattamento contabile';END IF;
 IF p_reason='arrotondamento' AND p_amount>1 THEN RAISE EXCEPTION 'Arrotondamento superiore a 1 euro: verifica la registrazione';END IF;
 INSERT INTO public.company_costs(company_id,name,amount,vat_rate,cost_type,recurrence,category,senza_fattura,due_date,documento_data,mese_competenza,payment_method,notes)
 VALUES(p_company,CASE p_reason WHEN 'commissioni' THEN 'Commissioni bancarie' ELSE 'Arrotondamento bancario' END,p_amount,0,'variable','once','struttura_servizi',true,t.booking_date,t.booking_date,date_trunc('month',t.booking_date)::date,'bonifico','[BANCA:'||t.id||'] Differenza esplicitamente confermata') RETURNING id INTO cost;
 payment:=public.registra_pagamento_costo(cost,gen_random_uuid(),p_amount,t.booking_date,'bonifico',t.reference);
 pn:=(payment->>'prima_nota_id')::uuid;
 IF pn IS NULL THEN RAISE EXCEPTION 'Pagamento della differenza non registrato';END IF;
 PERFORM public.bank_associa_pagamenti(p_company,t.id,ARRAY[pn]);
 INSERT INTO private.bank_adjustment_payments(prima_nota_id,company_id,cost_id,transaction_id,created_by) VALUES(pn,p_company,cost,t.id,auth.uid());
END $$;
REVOKE ALL ON FUNCTION private.bank_register_difference(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bank_reverse_difference(p_payment uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.bank_adjustment_payments;
BEGIN
 SELECT * INTO a FROM private.bank_adjustment_payments WHERE prima_nota_id=p_payment FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM private.bank_operativa_access(a.company_id,true);
 IF a.reversed_at IS NULL THEN
  PERFORM public.storna_pagamenti_costo(a.cost_id);
  UPDATE private.bank_adjustment_payments SET reversed_at=now() WHERE prima_nota_id=p_payment;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.bank_reverse_difference(uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.bank_scollega_pagamento(uuid)'::regprocedure) INTO def;
 IF strpos(def,'bank_reverse_difference')=0 THEN
  def:=replace(def,$old$RETURN jsonb_build_object('tipo','pagamento_esistente','pagamento_conservato',true);$old$,$new$IF private.bank_reverse_difference(r.prima_nota_id) THEN RETURN jsonb_build_object('tipo','differenza','pagamento_conservato',false);END IF;
 RETURN jsonb_build_object('tipo','pagamento_esistente','pagamento_conservato',true);$new$);
  IF strpos(def,'bank_reverse_difference')=0 THEN RAISE EXCEPTION 'Rivedere annullamento differenze';END IF;EXECUTE def;
 END IF;
 SELECT pg_get_functiondef('private.bank_movimento_links(uuid,uuid)'::regprocedure) INTO def;
 IF strpos(def,'bank_adjustment_payments')=0 THEN
  def:=replace(def,$old$'existing_payment',r.prima_nota_id IS NOT NULL OR r.payment_source IS NOT NULL$old$,$new$'adjustment',EXISTS(SELECT 1 FROM private.bank_adjustment_payments a WHERE a.prima_nota_id=r.prima_nota_id AND a.company_id=p_company),'existing_payment',r.prima_nota_id IS NOT NULL OR r.payment_source IS NOT NULL$new$);
  IF strpos(def,'bank_adjustment_payments')=0 THEN RAISE EXCEPTION 'Rivedere dettaglio differenze';END IF;EXECUTE def;
 END IF;
END $$;

-- Private idempotency ledger: a lost HTTP response cannot create payments twice.
CREATE TABLE IF NOT EXISTS private.bank_reconciliation_batches(
 id uuid PRIMARY KEY,company_id uuid NOT NULL,user_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.bank_reconciliation_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bank_reconciliation_batches FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.bank_conferma_lotto(p_company uuid,p_request uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;t public.bank_transactions;d jsonb;res jsonb;results jsonb:='[]';prior private.bank_reconciliation_batches; note text;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF auth.uid() IS NULL OR p_request IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Seleziona da 1 a 100 movimenti';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text,2810));
 SELECT * INTO prior FROM private.bank_reconciliation_batches WHERE id=p_request;
 IF FOUND THEN
  IF prior.company_id<>p_company OR prior.user_id<>auth.uid() OR prior.payload<>p_items THEN RAISE EXCEPTION 'Richiesta già utilizzata con altre operazioni';END IF;
  RETURN prior.result;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Lo stesso movimento compare due volte';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'id' LOOP
  SELECT * INTO t FROM public.bank_transactions WHERE id=(item->>'id')::uuid AND company_id=p_company FOR UPDATE;
  IF NOT FOUND OR t.status IS DISTINCT FROM 'booked' OR t.currency IS DISTINCT FROM 'EUR' THEN RAISE EXCEPTION 'Movimento non disponibile, non contabilizzato o in valuta diversa da EUR';END IF;
  d:=private.bank_movimento_links(p_company,t.id);
  IF (item->>'expected_remaining')::numeric IS NULL OR (item->>'revision')::int IS NULL OR (item->>'expected_remaining')::numeric IS DISTINCT FROM (d->>'remaining')::numeric OR (item->>'revision')::int IS DISTINCT FROM (d->>'revision')::int THEN RAISE EXCEPTION 'Un movimento è cambiato: aggiorna e verifica le selezioni. Nessuna operazione del lotto è stata registrata.' USING ERRCODE='PT409';END IF;
  note:=nullif(btrim(item->>'note'),'');
  IF item->>'mode'='documents' THEN
   IF nullif(item->>'proposal_key','') IS NOT NULL AND (SELECT count(*)<>1 OR min(v->>'key') IS DISTINCT FROM item->>'proposal_key' FROM jsonb_array_elements(public.bank_proposte_movimento(p_company,t.id,'')) v WHERE (v->>'forte')::boolean) THEN RAISE EXCEPTION 'La proposta non ha più riscontri univoci: verifica singolarmente. Nessuna operazione registrata.';END IF;
   IF (SELECT coalesce(sum((v->>'importo')::numeric),0) FROM jsonb_array_elements(item->'rows') v)<(d->>'remaining')::numeric AND nullif(item->>'difference_reason','') IS NULL THEN RAISE EXCEPTION 'Indica come gestire la differenza residua';END IF;
   IF nullif(item->>'difference_reason','') IS NOT NULL THEN note:=concat_ws(' · ',note,'Residuo da verificare: '||(item->>'difference_reason'));END IF;
   res:=public.bank_conferma_ripartizione(p_company,t.id,item->'rows',note);
   IF item->>'difference_reason' IN('commissioni','arrotondamento') THEN PERFORM private.bank_register_difference(p_company,t.id,(res->>'resto')::numeric,item->>'difference_reason');END IF;
  ELSIF item->>'mode'='none' THEN
   IF item->>'category' NOT IN('Bancario','Tasse & Tributi','Stipendi','Finanziamento','Giroconto','Altra entrata','Altra spesa','Arrotondamento') OR nullif(item->>'category','') IS NULL THEN RAISE EXCEPTION 'Scegli una categoria senza fattura';END IF;
   res:=public.chiudi_movimento_senza_fattura(t.id,CASE WHEN t.transaction_type='debit' AND item->>'category' IN('Bancario','Altra spesa','Arrotondamento') THEN 'spesa' ELSE 'nessun_costo' END,item->>'category',coalesce(note,t.description,item->>'category'),'struttura_servizi');
  ELSIF item->>'mode'='withholding' THEN
   IF t.transaction_type<>'credit' OR nullif(item->>'document_id','') IS NULL THEN RAISE EXCEPTION 'Scegli una fattura interna per il bonifico parlante';END IF;
   PERFORM public.riconcilia_bonifico_parlante(t.id,(item->>'document_id')::uuid);res:='{}';
  ELSE RAISE EXCEPTION 'Operazione non valida';END IF;
  results:=results||jsonb_build_array(jsonb_build_object('id',t.id,'booking_date',t.booking_date,'result',res));
 END LOOP;
 res:=jsonb_build_object('count',jsonb_array_length(p_items),'items',results);
 INSERT INTO private.bank_reconciliation_batches(id,company_id,user_id,payload,result) VALUES(p_request,p_company,auth.uid(),p_items,res);
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.bank_conferma_lotto(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_conferma_lotto(uuid,uuid,jsonb) TO authenticated;

-- Exact work totals, from all filtered movements rather than the current page.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.bank_movimenti_elenco(uuid,jsonb,integer,integer)'::regprocedure) INTO def;
 IF strpos(def,'unreconciled_count')=0 THEN
  def:=replace(def,'sum(amount) net FROM filtered GROUP BY currency', 'sum(amount) net,count(*) FILTER(WHERE chiuso_senza_documento IS NULL AND (links->>''remaining'')::numeric>0) unreconciled_count,coalesce(sum((links->>''remaining'')::numeric) FILTER(WHERE chiuso_senza_documento IS NULL AND (links->>''remaining'')::numeric>0),0) unreconciled_amount FROM filtered GROUP BY currency');
  IF strpos(def,'unreconciled_count')=0 THEN RAISE EXCEPTION 'Rivedere il riepilogo del registro';END IF;
  EXECUTE def;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.bank_proposte_lotto(p_company uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE tx uuid; result jsonb:='{}'; BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF coalesce(cardinality(p_ids),0)>50 THEN RAISE EXCEPTION 'Analizza al massimo 50 movimenti per pagina';END IF;
 FOREACH tx IN ARRAY coalesce(p_ids,ARRAY[]::uuid[]) LOOP
  result:=result||jsonb_build_object(tx::text,public.bank_proposte_movimento(p_company,tx,''));
 END LOOP;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bank_proposte_lotto(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_proposte_lotto(uuid,uuid[]) TO authenticated;
-- Imported invoices need a local residual even while provider write-back is offline.
CREATE TABLE IF NOT EXISTS private.bank_imported_allocations(reconciliation_id uuid PRIMARY KEY,company_id uuid NOT NULL,invoice_id uuid NOT NULL,amount numeric NOT NULL,reversed_at timestamptz);
ALTER TABLE private.bank_imported_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bank_imported_allocations FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bank_record_imported(p_company uuid,p_tx uuid,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb;rc uuid;paid numeric;total numeric;outrows jsonb:='[]';
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_result->'esterne','[]')) LOOP
  SELECT r.id INTO rc FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.invoice_id=(e->>'invoice_id')::uuid AND r.unmatched_at IS NULL;
  IF rc IS NULL THEN RAISE EXCEPTION 'Riscontro della fattura importata non disponibile';END IF;
  INSERT INTO private.bank_imported_allocations(reconciliation_id,company_id,invoice_id,amount) VALUES(rc,p_company,(e->>'invoice_id')::uuid,(e->>'importo')::numeric);
  UPDATE public.invoices SET paid_amount=coalesce(paid_amount,0)+(e->>'importo')::numeric WHERE id=(e->>'invoice_id')::uuid AND company_id=p_company RETURNING paid_amount,invoices.total INTO paid,total;
  IF paid>total+0.004 THEN RAISE EXCEPTION 'Le quote superano il residuo della fattura importata';END IF;
  UPDATE public.invoices SET status=CASE WHEN paid>=total-0.004 THEN 'paid' ELSE 'issued' END WHERE id=(e->>'invoice_id')::uuid AND company_id=p_company;
  outrows:=outrows||jsonb_build_array(e||jsonb_build_object('allinea',true,'saldata',paid>=total-0.004));
 END LOOP;
 RETURN p_result||jsonb_build_object('esterne',outrows);
END $$;
REVOKE ALL ON FUNCTION private.bank_record_imported(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.bank_reverse_imported(p_reconciliation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.bank_imported_allocations;
BEGIN
 SELECT * INTO a FROM private.bank_imported_allocations WHERE reconciliation_id=p_reconciliation FOR UPDATE;
 IF NOT FOUND OR a.reversed_at IS NOT NULL THEN RETURN;END IF;
 PERFORM private.bank_operativa_access(a.company_id,true);
 UPDATE public.invoices SET paid_amount=greatest(0,coalesce(paid_amount,0)-a.amount),status='issued' WHERE id=a.invoice_id AND company_id=a.company_id;
 UPDATE private.bank_imported_allocations SET reversed_at=now() WHERE reconciliation_id=p_reconciliation;
END $$;
REVOKE ALL ON FUNCTION private.bank_reverse_imported(uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.bank_conferma_lotto(uuid,uuid,jsonb)'::regprocedure) INTO def;
 IF strpos(def,'bank_record_imported')=0 THEN
  def:=replace(def,$old$res:=public.bank_conferma_ripartizione(p_company,t.id,item->'rows',note);$old$,$new$res:=public.bank_conferma_ripartizione(p_company,t.id,item->'rows',note);
   res:=private.bank_record_imported(p_company,t.id,res);$new$);
  IF strpos(def,'bank_record_imported')=0 THEN RAISE EXCEPTION 'Rivedere residui importati';END IF;EXECUTE def;
 END IF;
 SELECT pg_get_functiondef('public.scollega_riga_ripartita(uuid)'::regprocedure) INTO def;
 IF strpos(def,'bank_reverse_imported')=0 THEN
  -- The supported invoice branch removes only this reconciliation's payment.
  IF strpos(def,'DELETE FROM public.invoice_payments')>0 THEN
   def:=replace(def,$old$DELETE FROM public.invoice_payments WHERE invoice_id = rc.invoice_id AND reference = 'recon:' || rc.id::text;$old$,$new$DELETE FROM public.invoice_payments WHERE invoice_id = rc.invoice_id AND reference = 'recon:' || rc.id::text;
    PERFORM private.bank_reverse_imported(rc.id);$new$);
   def:=replace(def,$old$'importo', rc.matched_amount, 'provider', v_provider)$old$,$new$'importo', rc.matched_amount, 'provider', v_provider, 'allinea', EXISTS(SELECT 1 FROM private.bank_imported_allocations a WHERE a.reconciliation_id=rc.id))$new$);
   IF strpos(def,'bank_reverse_imported')=0 THEN RAISE EXCEPTION 'Rivedere annullamento fatture importate';END IF;EXECUTE def;
  END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bank_external_payment_target(p_invoice uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE co uuid;target numeric;
BEGIN
 SELECT company_id,paid_amount INTO co,target FROM public.invoices WHERE id=p_invoice;
 IF co IS NULL THEN RAISE EXCEPTION 'Fattura non disponibile';END IF;
 IF coalesce(auth.role(),'')<>'service_role' THEN
  PERFORM private.bank_operativa_access(co,true);
  IF NOT public.puo_incassare_fatture(co) THEN RAISE EXCEPTION 'Non hai accesso agli incassi' USING ERRCODE='42501';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.bank_imported_allocations WHERE invoice_id=p_invoice AND company_id=co) THEN RAISE EXCEPTION 'Nessuna riconciliazione bancaria da sincronizzare';END IF;
 RETURN coalesce(target,0);
END $$;
REVOKE ALL ON FUNCTION public.bank_external_payment_target(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_external_payment_target(uuid) TO authenticated,service_role;
