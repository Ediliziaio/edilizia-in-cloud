SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS operativita_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS prima_nota_id uuid REFERENCES public.prima_nota_entries(id);
ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS payment_source jsonb;
ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_prima_nota_id_fkey;
ALTER TABLE public.bank_reconciliations ADD CONSTRAINT bank_reconciliations_prima_nota_id_fkey FOREIGN KEY(prima_nota_id) REFERENCES public.prima_nota_entries(id) ON DELETE SET NULL;
ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_target_check;
ALTER TABLE public.bank_reconciliations ADD CONSTRAINT bank_reconciliations_target_check CHECK(unmatched_at IS NOT NULL OR invoice_id IS NOT NULL OR scadenza_id IS NOT NULL OR movimento_id IS NOT NULL OR documento_id IS NOT NULL OR prima_nota_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bank_recon_prima_nota_active_idx ON public.bank_reconciliations(prima_nota_id) WHERE prima_nota_id IS NOT NULL AND unmatched_at IS NULL;
CREATE INDEX IF NOT EXISTS bank_recon_transaction_active_idx ON public.bank_reconciliations(company_id,transaction_id) WHERE unmatched_at IS NULL;
CREATE TABLE IF NOT EXISTS public.bank_transaction_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),
 transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('commessa','mezzo','fornitore','dipendente','cedolino')),
 target_id uuid NOT NULL,amount numeric(12,2) NOT NULL CHECK(amount>0),note text,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),removed_at timestamptz,removed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_context_active_target_idx ON public.bank_transaction_contexts(transaction_id,kind,target_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS bank_context_company_transaction_idx ON public.bank_transaction_contexts(company_id,transaction_id);
CREATE INDEX IF NOT EXISTS bank_context_target_idx ON public.bank_transaction_contexts(company_id,kind,target_id) WHERE removed_at IS NULL;
ALTER TABLE public.bank_transaction_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_transaction_contexts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.bank_transaction_contexts TO service_role;

CREATE OR REPLACE FUNCTION private.bank_operativa_access(p_company uuid,p_write boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR public.utente_bloccato() OR public.utente_e_cliente_esterno()
 OR (public.has_permission_for_company(auth.uid(),'can_view_tesoreria',p_company) OR public.user_can_read_accountant_company(p_company)) IS NOT TRUE
 OR (p_write AND (public.utente_sola_lettura(p_company) OR public.has_permission_for_company(auth.uid(),'can_reconcile_bank_transactions',p_company) IS NOT TRUE)) THEN
 RAISE EXCEPTION 'Non hai il permesso di gestire questi movimenti' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.bank_operativa_access(uuid,boolean) FROM PUBLIC,anon,authenticated;

-- Context links are annotations, not a second accounting ledger. Financial
-- allocation is always owned by bank_reconciliations and the existing payments.
CREATE OR REPLACE FUNCTION private.bank_target(p_company uuid,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 IF p_kind='commessa' AND public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ',order_code,description),'url','/azienda/ordini/'||id) INTO j FROM public.orders_visibili WHERE id=p_id AND company_id=p_company AND deleted_at IS NULL;
 ELSIF p_kind='mezzo' AND public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' · ',nome,targa),'url','/azienda/mezzi/'||id) INTO j FROM public.mezzi WHERE id=p_id AND company_id=p_company AND deleted_at IS NULL;
 ELSIF p_kind='fornitore' AND (public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)) THEN
  SELECT jsonb_build_object('id',id,'kind',p_kind,'label',name,'url',NULL) INTO j FROM public.suppliers WHERE id=p_id AND company_id=p_company;
 ELSIF p_kind IN('dipendente','cedolino') AND (public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid())) THEN
  IF p_kind='dipendente' THEN
   SELECT jsonb_build_object('id',id,'kind',p_kind,'label',concat_ws(' ',nome,cognome),'url','/azienda/personale') INTO j FROM public.hr_profili WHERE id=p_id AND company_id=p_company;
  ELSE
   SELECT jsonb_build_object('id',h.id,'kind',p_kind,'label',concat('Cedolino ',lpad(h.mese::text,2,'0'),'/',h.anno,' · ',e.first_name,' ',e.last_name),'url','/azienda/personale') INTO j FROM public.hr_cedolini h JOIN public.employees e ON e.id=h.employee_id AND e.company_id=h.company_id WHERE h.id=p_id AND h.company_id=p_company;
  END IF;
 END IF;
 RETURN j;
END $$;
REVOKE ALL ON FUNCTION private.bank_target(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.bank_movimento_links(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions; r record; doc public.documenti_fiscali; inv public.invoices; s public.scadenze; pn public.prima_nota_entries; c public.company_costs;
 v_doc uuid; v_inv uuid; j jsonb; target jsonb; job uuid; jobs jsonb; financial jsonb:='[]'; contexts jsonb:='[]'; history jsonb:='[]'; matched numeric:=0; restricted boolean:=false; titolo text; url text; tipo text;
 billing boolean:=public.has_permission_for_company(auth.uid(),'can_view_billing',p_company); costs boolean:=public.has_permission_for_company(auth.uid(),'can_view_costs',p_company);
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF t.metadata->>'provider'='saltedge' AND t.metadata->>'currency_code'=t.currency AND jsonb_typeof(t.metadata->'amount')='number' THEN t.amount:=(t.metadata->>'amount')::numeric; END IF;
 FOR r IN SELECT * FROM public.bank_reconciliations WHERE transaction_id=t.id AND company_id=p_company ORDER BY matched_at,id LOOP
  doc:=NULL;inv:=NULL;s:=NULL;pn:=NULL;c:=NULL;jobs:='[]';v_doc:=coalesce(r.documento_id,(r.payment_source->>'documento_id')::uuid);v_inv:=coalesce(r.invoice_id,(r.payment_source->>'invoice_id')::uuid);url:=NULL;
  IF r.prima_nota_id IS NOT NULL THEN SELECT * INTO pn FROM public.prima_nota_entries WHERE id=r.prima_nota_id AND company_id=p_company;v_doc:=coalesce(v_doc,pn.documento_fiscale_id);v_inv:=coalesce(v_inv,pn.invoice_id);END IF;
  IF r.movimento_id IS NOT NULL THEN SELECT documento_id INTO v_doc FROM public.movimenti_cassa_native WHERE id=r.movimento_id AND company_id=p_company;END IF;
  IF coalesce(r.scadenza_id,(r.payment_source->>'scadenza_id')::uuid) IS NOT NULL THEN SELECT * INTO s FROM public.scadenze WHERE id=coalesce(r.scadenza_id,(r.payment_source->>'scadenza_id')::uuid) AND company_id=p_company;v_inv:=coalesce(v_inv,s.invoice_id);END IF;
  IF v_doc IS NOT NULL THEN SELECT * INTO doc FROM public.documenti_fiscali WHERE id=v_doc AND company_id=p_company;END IF;
  IF v_inv IS NOT NULL THEN SELECT * INTO inv FROM public.invoices WHERE id=v_inv AND company_id=p_company;END IF;
  IF coalesce(s.cost_id,pn.cost_id,(r.payment_source->>'cost_id')::uuid) IS NOT NULL THEN SELECT * INTO c FROM public.company_costs WHERE id=coalesce(s.cost_id,pn.cost_id,(r.payment_source->>'cost_id')::uuid) AND company_id=p_company;END IF;
  tipo:=CASE WHEN r.prima_nota_id IS NOT NULL OR r.payment_source IS NOT NULL THEN 'pagamento' WHEN v_doc IS NOT NULL THEN 'documento' WHEN v_inv IS NOT NULL THEN 'invoice' ELSE 'scadenza' END;
  titolo:=CASE WHEN v_doc IS NOT NULL AND billing THEN 'Fattura '||doc.numero WHEN v_inv IS NOT NULL AND billing THEN 'Fattura '||inv.invoice_number WHEN r.prima_nota_id IS NOT NULL AND public.has_permission_for_company(auth.uid(),'can_view_prima_nota',p_company) THEN pn.description WHEN costs THEN coalesce(s.description,c.name,'Pagamento') ELSE 'Documento riservato' END;
  IF billing AND doc.id IS NOT NULL THEN url:='/azienda/documenti/'||v_doc||'/dettaglio';ELSIF billing AND inv.id IS NOT NULL THEN url:='/azienda/documenti/importata/'||v_inv;ELSIF costs AND r.scadenza_id IS NOT NULL THEN url:='/azienda/scadenzario';END IF;
  FOR job IN SELECT x FROM (SELECT doc.ordine_id x UNION SELECT inv.order_id UNION SELECT s.order_id UNION SELECT c.order_id UNION SELECT pn.order_id UNION SELECT (r.payment_source->>'order_id')::uuid UNION SELECT fo.ordine_id FROM public.fattura_ordine fo WHERE fo.fattura_id=v_doc AND fo.company_id=p_company) q WHERE x IS NOT NULL LOOP
   target:=private.bank_target(p_company,'commessa',job);IF target IS NOT NULL THEN jobs:=jobs||target;END IF;
  END LOOP;
  j:=jsonb_build_object('id',r.id,'kind',tipo,'label',coalesce(titolo,'Documento non disponibile'),'amount',r.matched_amount,'url',url,'jobs',jobs,'note',r.notes,'matched_at',r.matched_at,'unmatched_at',r.unmatched_at,'split',r.ripartita,'existing_payment',r.prima_nota_id IS NOT NULL OR r.payment_source IS NOT NULL);
  IF r.unmatched_at IS NULL THEN financial:=financial||j;matched:=matched+r.matched_amount;ELSE history:=history||j;END IF;
 END LOOP;
 -- Preserve visibility of legacy direct links that predate reconciliation rows.
 IF financial='[]'::jsonb AND (t.linked_invoice_id IS NOT NULL OR t.linked_cost_id IS NOT NULL OR t.linked_installment_id IS NOT NULL OR t.linked_scadenza_id IS NOT NULL) THEN
  titolo:='Collegamento storico';url:=NULL;jobs:='[]';
  IF t.linked_invoice_id IS NOT NULL AND billing THEN SELECT 'Fattura '||invoice_number,'/azienda/documenti/importata/'||id INTO titolo,url FROM public.invoices WHERE id=t.linked_invoice_id AND company_id=p_company;END IF;
  IF t.linked_cost_id IS NOT NULL AND costs THEN SELECT * INTO c FROM public.company_costs WHERE id=t.linked_cost_id AND company_id=p_company;titolo:=coalesce(c.name,titolo);target:=private.bank_target(p_company,'commessa',c.order_id);IF target IS NOT NULL THEN jobs:=jobs||target;END IF;END IF;
  financial:=jsonb_build_array(jsonb_build_object('id',NULL,'kind','storico','label',titolo,'amount',abs(t.amount),'url',url,'jobs',jobs,'split',false));matched:=abs(t.amount);
 END IF;
 FOR r IN SELECT * FROM public.bank_transaction_contexts WHERE transaction_id=t.id AND company_id=p_company AND removed_at IS NULL ORDER BY created_at,id LOOP
  target:=private.bank_target(p_company,r.kind,r.target_id);
  IF target IS NULL THEN
   IF (r.kind IN('dipendente','cedolino') AND (public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid())) IS NOT TRUE) OR (r.kind='commessa' AND public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) IS NOT TRUE) OR (r.kind='mezzo' AND public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) IS NOT TRUE) OR (r.kind='fornitore' AND (billing OR costs) IS NOT TRUE) THEN restricted:=true;
   ELSE target:=jsonb_build_object('id',r.target_id,'kind',r.kind,'label','Riferimento non più disponibile','url',NULL); END IF;
  END IF;
  IF target IS NOT NULL THEN contexts:=contexts||(target||jsonb_build_object('context_id',r.id,'amount',r.amount,'note',r.note));END IF;
 END LOOP;
 RETURN jsonb_build_object('financial',financial,'contexts',contexts,'restricted_contexts',restricted,'history',history,'matched',least(abs(t.amount),matched),'remaining',CASE WHEN t.chiuso_senza_documento IS NOT NULL THEN 0 ELSE greatest(0,abs(t.amount)-matched) END,'revision',t.operativita_revision);
END $$;
REVOKE ALL ON FUNCTION private.bank_movimento_links(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bank_movimenti_elenco(p_company uuid,p_filters jsonb DEFAULT '{}',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; q text:=btrim(coalesce(p_filters->>'search','')); amount_q numeric; date_q date;
BEGIN
 PERFORM private.bank_operativa_access(p_company,false);
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN RAISE EXCEPTION 'Pagina non valida';END IF;
 IF coalesce(p_filters->>'from','')<>'' AND coalesce(p_filters->>'to','')<>'' AND (p_filters->>'from')::date>(p_filters->>'to')::date THEN RAISE EXCEPTION 'La data iniziale deve precedere quella finale';END IF;
 BEGIN IF q~'^[-+]?[0-9.,]+( *€)?$' THEN amount_q:=CASE WHEN strpos(q,',')>0 OR q~'^[0-9]{1,3}(\.[0-9]{3})+$' THEN replace(replace(replace(q,'€',''),'.',''),',','.')::numeric ELSE replace(q,'€','')::numeric END;END IF;EXCEPTION WHEN OTHERS THEN amount_q:=NULL;END;
 BEGIN IF q~'^\d{4}-\d{2}-\d{2}$' THEN date_q:=q::date;ELSIF q~'^\d{2}/\d{2}/\d{4}$' THEN date_q:=to_date(q,'DD/MM/YYYY');END IF;EXCEPTION WHEN OTHERS THEN date_q:=NULL;END;
 WITH base AS MATERIALIZED(
 SELECT t.id,t.account_id,t.booking_date,t.value_date,CASE WHEN t.metadata->>'provider'='saltedge' AND t.metadata->>'currency_code'=t.currency AND jsonb_typeof(t.metadata->'amount')='number' THEN (t.metadata->>'amount')::numeric ELSE t.amount END amount,t.currency,t.description,t.creditor_name,t.debtor_name,t.creditor_iban,t.debtor_iban,t.reference,t.transaction_type,t.status,t.category,t.note,t.reconciliation_status,t.chiuso_senza_documento,t.reconciliation_suggestions,
  coalesce(a.display_name,a.account_name,'Conto') account_name
 FROM public.bank_transactions_operativi t LEFT JOIN public.bank_accounts_operativi a ON a.id=t.account_id AND a.company_id=t.company_id
 WHERE t.company_id=p_company
 AND (coalesce(p_filters->>'account','all')='all' OR t.account_id=nullif(p_filters->>'account','all')::uuid)
 AND (coalesce(p_filters->>'direction','all')='all' OR t.transaction_type=p_filters->>'direction')
 AND (coalesce(p_filters->>'category','all')='all' OR t.category=p_filters->>'category')
 AND (coalesce(p_filters->>'currency','all')='all' OR t.currency=p_filters->>'currency')
 AND (nullif(p_filters->>'from','') IS NULL OR t.booking_date>=nullif(p_filters->>'from','')::date)
 AND (nullif(p_filters->>'to','') IS NULL OR t.booking_date<=nullif(p_filters->>'to','')::date)
 AND (nullif(p_filters->>'min','') IS NULL OR abs(t.amount)>=nullif(p_filters->>'min','')::numeric)
 AND (nullif(p_filters->>'max','') IS NULL OR abs(t.amount)<=nullif(p_filters->>'max','')::numeric)
 ), enriched AS MATERIALIZED(SELECT b.*,private.bank_movimento_links(p_company,b.id) links FROM base b),
 filtered AS MATERIALIZED(SELECT * FROM enriched e WHERE
 (q='' OR lower(concat_ws(' ',e.description,e.creditor_name,e.debtor_name,e.reference,e.note,e.account_name,e.links->'financial',e.links->'contexts')) LIKE '%'||replace(replace(replace(lower(q),'\','\\'),'%','\%'),'_','\_')||'%' OR abs(e.amount)=amount_q OR e.booking_date=date_q)
 AND (coalesce(p_filters->>'state','all')='all' OR
  CASE p_filters->>'state' WHEN 'work' THEN e.reconciliation_status IN('pending','parziale','suggestion') AND e.chiuso_senza_documento IS NULL WHEN 'pending' THEN e.reconciliation_status='pending' AND e.chiuso_senza_documento IS NULL WHEN 'suggestion' THEN e.reconciliation_status='suggestion' WHEN 'reconciled' THEN e.reconciliation_status='reconciled' WHEN 'ignored' THEN e.chiuso_senza_documento IS NOT NULL OR e.reconciliation_status='ignored' WHEN 'partial' THEN e.reconciliation_status='parziale' ELSE false END)
 AND (coalesce(p_filters->>'linked','all')='all' OR CASE p_filters->>'linked' WHEN 'yes' THEN jsonb_array_length(e.links->'financial')+jsonb_array_length(e.links->'contexts')>0 WHEN 'no' THEN jsonb_array_length(e.links->'financial')+jsonb_array_length(e.links->'contexts')=0 ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(e.links->'contexts') l WHERE l->>'kind'=p_filters->>'linked') OR (p_filters->>'linked'='commessa' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.links->'financial') l WHERE jsonb_array_length(l->'jobs')>0)) END)
 AND (nullif(p_filters->>'target','') IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(e.links->'contexts') ctx WHERE ctx->>'id'=p_filters->>'target' AND ctx->>'kind'=coalesce(p_filters->>'target_kind','commessa')) OR (coalesce(p_filters->>'target_kind','commessa')='commessa' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.links->'financial') fin CROSS JOIN LATERAL jsonb_array_elements(fin->'jobs') job WHERE job->>'id'=p_filters->>'target')))
 ), page AS(SELECT * FROM filtered ORDER BY booking_date DESC NULLS LAST,id DESC LIMIT p_limit OFFSET p_offset), totals AS(
 SELECT currency,count(*) n,sum(CASE WHEN amount>0 THEN amount ELSE 0 END) income,sum(CASE WHEN amount<0 THEN -amount ELSE 0 END) expenses,sum(amount) net FROM filtered GROUP BY currency)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY booking_date DESC NULLS LAST,id DESC) FROM page p),'[]'), 'count',(SELECT count(*) FROM filtered),'facets',jsonb_build_object('currencies',coalesce((SELECT jsonb_agg(currency) FROM (SELECT DISTINCT currency FROM base WHERE currency IS NOT NULL ORDER BY currency) f),'[]'),'categories',coalesce((SELECT jsonb_agg(category) FROM (SELECT DISTINCT category FROM base WHERE category IS NOT NULL ORDER BY category) f),'[]')),'totals',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM totals t),'[]')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bank_movimenti_elenco(uuid,jsonb,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_movimenti_elenco(uuid,jsonb,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_movimento_note(p_company uuid,p_tx uuid,p_note text,p_category text,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rev integer;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(coalesce(p_note,''))>10000 OR length(coalesce(p_category,''))>100 THEN RAISE EXCEPTION 'Testo troppo lungo';END IF;
 UPDATE public.bank_transactions SET note=nullif(btrim(p_note),''),category=nullif(btrim(p_category),''),operativita_revision=operativita_revision+1
 WHERE id=p_tx AND company_id=p_company AND operativita_revision=p_revision RETURNING operativita_revision INTO rev;
 IF rev IS NULL THEN RAISE EXCEPTION 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' USING ERRCODE='40001';END IF;
 RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.bank_movimento_note(uuid,uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_movimento_note(uuid,uuid,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_context_save(p_company uuid,p_tx uuid,p_rows jsonb,p_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions;r record;rev integer;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;
 IF p_revision IS NULL OR t.operativita_revision<>p_revision THEN RAISE EXCEPTION 'Il movimento è stato modificato in un’altra finestra. Ricarica prima di salvare.' USING ERRCODE='40001';END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>40 THEN RAISE EXCEPTION 'Collegamenti non validi';END IF;
 FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) x(kind text,target_id uuid,amount numeric,note text) LOOP
  IF r.kind IS NULL OR r.target_id IS NULL OR r.amount IS NULL OR r.amount<=0 OR r.amount<>round(r.amount,2) OR length(coalesce(r.note,''))>1000 OR private.bank_target(p_company,r.kind,r.target_id) IS NULL THEN RAISE EXCEPTION 'Controlla tipo, destinatario e quota del collegamento' USING ERRCODE='42501';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)x(kind text,target_id uuid) GROUP BY kind,target_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Lo stesso collegamento compare due volte';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows)x(kind text,amount numeric) GROUP BY kind HAVING sum(amount)>abs(t.amount)) THEN RAISE EXCEPTION 'Le quote dello stesso tipo superano l’importo del movimento';END IF;
 -- Hidden personnel links cannot be read, changed or removed by an operator without HR access.
 IF EXISTS(SELECT 1 FROM public.bank_transaction_contexts c WHERE c.transaction_id=t.id AND c.removed_at IS NULL AND ((c.kind IN('dipendente','cedolino') AND (public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid())) IS NOT TRUE) OR (c.kind='commessa' AND public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) IS NOT TRUE) OR (c.kind='mezzo' AND public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) IS NOT TRUE) OR (c.kind='fornitore' AND (public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)) IS NOT TRUE))) THEN RAISE EXCEPTION 'Alcuni collegamenti sono riservati. Serve un amministratore per modificarli.' USING ERRCODE='42501';END IF;
 UPDATE public.bank_transaction_contexts SET removed_at=now(),removed_by=auth.uid() WHERE transaction_id=t.id AND company_id=p_company AND removed_at IS NULL;
 INSERT INTO public.bank_transaction_contexts(company_id,transaction_id,kind,target_id,amount,note,created_by) SELECT p_company,t.id,kind,target_id,amount,nullif(btrim(note),''),auth.uid() FROM jsonb_to_recordset(p_rows)x(kind text,target_id uuid,amount numeric,note text);
 UPDATE public.bank_transactions SET operativita_revision=operativita_revision+1 WHERE id=t.id RETURNING operativita_revision INTO rev;RETURN rev;
END $$;
REVOKE ALL ON FUNCTION public.bank_context_save(uuid,uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_context_save(uuid,uuid,jsonb,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_context_choices(p_company uuid,p_kind text,p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];result jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,false);
 CASE p_kind
 WHEN 'commessa' THEN SELECT array_agg(id) INTO ids FROM public.orders_visibili WHERE company_id=p_company AND deleted_at IS NULL;
 WHEN 'mezzo' THEN IF public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) THEN SELECT array_agg(id) INTO ids FROM public.mezzi WHERE company_id=p_company AND deleted_at IS NULL;END IF;
 WHEN 'fornitore' THEN IF public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) OR public.has_permission_for_company(auth.uid(),'can_view_billing',p_company) THEN SELECT array_agg(id) INTO ids FROM public.suppliers WHERE company_id=p_company;END IF;
 WHEN 'dipendente' THEN IF public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid()) THEN SELECT array_agg(id) INTO ids FROM public.hr_profili WHERE company_id=p_company;END IF;
 WHEN 'cedolino' THEN IF public.e_amministratore_di(p_company) OR public.is_super_admin(auth.uid()) THEN SELECT array_agg(id) INTO ids FROM public.hr_cedolini WHERE company_id=p_company;END IF;
 ELSE RAISE EXCEPTION 'Tipo di collegamento non valido';END CASE;
 SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM (SELECT private.bank_target(p_company,p_kind,x) j FROM unnest(ids) x) q
 WHERE j IS NOT NULL AND strpos(lower(j->>'label'),lower(btrim(p_search)))>0;
 -- Limit response after matching; users can search all records, not just the first page.
 RETURN (SELECT coalesce(jsonb_agg(j),'[]') FROM (SELECT j FROM jsonb_array_elements(result) j ORDER BY j->>'label' LIMIT 30) s);
END $$;
REVOKE ALL ON FUNCTION public.bank_context_choices(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_context_choices(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_candidati_movimento(p_company uuid,p_tx uuid,p_search text DEFAULT '',p_existing boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions;result jsonb;q text:=lower(btrim(p_search));
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;
 IF coalesce(t.currency,'EUR')<>'EUR' THEN RAISE EXCEPTION 'Per movimenti in altre valute serve verificare il cambio: non vengono convertiti automaticamente';END IF;
 IF p_existing THEN
  IF public.has_permission_for_company(auth.uid(),'can_view_prima_nota',p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Non hai accesso al registro pagamenti' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',p.id,'tipo','pagamento','key','pagamento:'||p.id,'titolo',p.description,'sottotitolo',concat(p.entry_date,' · ',p.payment_method),'residuo',p.amount) j
   FROM public.prima_nota_entries p WHERE p.company_id=p_company AND p.amount>0 AND p.reversal_of IS NULL AND p.bank_transaction_id IS NULL
   AND coalesce(lower(p.payment_method),'') NOT IN('contanti','cash')
   AND p.direction=CASE WHEN t.transaction_type='credit' THEN 'entrata' ELSE 'uscita' END
   AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries z WHERE z.company_id=p_company AND z.reversal_of=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND (r.prima_nota_id=p.id OR (p.movimento_id IS NOT NULL AND r.movimento_id=p.movimento_id)))
   AND (q='' OR strpos(lower(concat_ws(' ',p.description,p.notes,p.reference_number,p.amount,p.entry_date)),q)>0)
   ORDER BY p.entry_date DESC,p.id LIMIT 100) z;
 ELSE
  WITH candidates AS(
   SELECT id,CASE origine WHEN 'nativa' THEN 'documento' ELSE 'invoice' END tipo,numero titolo,
    concat_ws(' · ',coalesce(nullif(cliente_snapshot->>'ragione_sociale',''),nullif(cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',cliente_snapshot->>'nome',cliente_snapshot->>'cognome'),'')),data_scadenza) sottotitolo,greatest(0,coalesce(totale_da_pagare,0)-coalesce(importo_pagato,0)-coalesce(stornato,0)) residuo
   FROM public.documenti_fiscali_elenco_operativo WHERE company_id=p_company AND deleted_at IS NULL AND t.transaction_type='credit'
   AND public.puo_incassare_fatture(p_company) AND public.has_permission_for_company(auth.uid(),'can_view_billing',p_company)
   AND tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','acconto_fattura','acconto_parcella','fattura_differita_b','fattura_riepilogativa','nota_debito')
   AND stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   UNION ALL
   SELECT s.id,'scadenza',s.description,concat_ws(' · ',f.name,s.due_date),s.amount-coalesce(s.paid_amount,0)
   FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false AND t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
  ) SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',id,'tipo',tipo,'key',tipo||':'||id,'titolo',titolo,'sottotitolo',sottotitolo,'residuo',residuo,'affine',id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])),'etichetta',CASE WHEN id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])) THEN 'Suggerita · da verificare' END) j FROM candidates
   WHERE residuo>0 AND (q='' OR strpos(lower(concat_ws(' ',titolo,sottotitolo,residuo)),q)>0) ORDER BY abs(residuo-abs(t.amount)),id LIMIT 100) z;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bank_candidati_movimento(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_candidati_movimento(uuid,uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_associa_pagamenti(p_company uuid,p_tx uuid,p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions;p public.prima_nota_entries;used numeric;total numeric:=0;x uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF public.has_permission_for_company(auth.uid(),'can_view_prima_nota',p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Non hai accesso al registro pagamenti' USING ERRCODE='42501';END IF;
 IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 100 OR array_position(p_ids,NULL) IS NOT NULL OR cardinality(p_ids)<>(SELECT count(DISTINCT y) FROM unnest(p_ids)y) THEN RAISE EXCEPTION 'Selezione pagamenti non valida';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text,2810));
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND OR coalesce(t.currency,'EUR')<>'EUR' OR t.status IS DISTINCT FROM 'booked' OR t.chiuso_senza_documento IS NOT NULL OR t.reconciliation_status='ignored' OR t.linked_invoice_id IS NOT NULL OR t.linked_cost_id IS NOT NULL OR t.linked_installment_id IS NOT NULL OR t.linked_scadenza_id IS NOT NULL THEN RAISE EXCEPTION 'Questo movimento non è disponibile per nuovi abbinamenti';END IF;
 IF EXISTS(SELECT 1 FROM public.bank_reconciliations WHERE transaction_id=t.id AND unmatched_at IS NULL AND NOT ripartita) THEN RAISE EXCEPTION 'Movimento già riconciliato';END IF;
 IF EXISTS(SELECT 1 FROM public.prima_nota_entries proof WHERE proof.company_id=p_company AND proof.bank_transaction_id=t.id AND proof.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries rev WHERE rev.company_id=p_company AND rev.reversal_of=proof.id) AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=t.id AND r.unmatched_at IS NULL AND (r.prima_nota_id=proof.id OR r.movimento_id=proof.movimento_id OR r.scadenza_id=proof.scadenza_id OR r.invoice_id=proof.invoice_id))) THEN RAISE EXCEPTION 'Esistono pagamenti bancari precedenti da verificare prima di aggiungere quote'; END IF;
 SELECT coalesce(sum(matched_amount),0) INTO used FROM public.bank_reconciliations WHERE transaction_id=t.id AND company_id=p_company AND unmatched_at IS NULL;
 FOR x IN SELECT unnest(p_ids) ORDER BY 1 LOOP
  SELECT * INTO p FROM public.prima_nota_entries WHERE id=x AND company_id=p_company FOR UPDATE;
  IF NOT FOUND OR p.amount IS NULL OR p.amount<=0 OR p.reversal_of IS NOT NULL OR p.bank_transaction_id IS NOT NULL OR coalesce(lower(p.payment_method),'') IN('contanti','cash') OR p.direction IS DISTINCT FROM(CASE WHEN t.transaction_type='credit' THEN 'entrata' ELSE 'uscita' END)
   OR EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE reversal_of=p.id AND company_id=p_company)
   OR EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND (r.prima_nota_id=p.id OR (p.movimento_id IS NOT NULL AND r.movimento_id=p.movimento_id))) THEN RAISE EXCEPTION 'Pagamento non disponibile o già collegato';END IF;
  total:=total+p.amount;
  IF used+total>abs(t.amount) THEN RAISE EXCEPTION 'I pagamenti superano il residuo del bonifico';END IF;
  UPDATE public.prima_nota_entries SET bank_transaction_id=t.id WHERE id=p.id AND company_id=p_company;
  INSERT INTO public.bank_reconciliations(company_id,transaction_id,prima_nota_id,payment_source,matched_amount,match_type,matched_by,matched_at,ripartita,notes)
  VALUES(p_company,t.id,p.id,jsonb_build_object('documento_id',p.documento_fiscale_id,'invoice_id',p.invoice_id,'cost_id',p.cost_id,'scadenza_id',p.scadenza_id,'order_id',p.order_id,'movimento_id',p.movimento_id),p.amount,'manual',auth.uid(),now(),true,'Prova bancaria di un pagamento già registrato');
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.bank_associa_pagamenti(uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_associa_pagamenti(uuid,uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_scollega_pagamento(p_riconciliazione uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.bank_reconciliations;
BEGIN
 SELECT * INTO r FROM public.bank_reconciliations WHERE id=p_riconciliazione;
 IF NOT FOUND THEN RAISE EXCEPTION 'Collegamento non disponibile';END IF;
 PERFORM private.bank_operativa_access(r.company_id,true);
 IF r.prima_nota_id IS NULL THEN RAISE EXCEPTION 'Questo collegamento va gestito dal documento';END IF;
 IF public.has_permission_for_company(auth.uid(),'can_view_prima_nota',r.company_id) IS NOT TRUE THEN RAISE EXCEPTION 'Non hai accesso al registro pagamenti' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.company_id::text,2810));
 PERFORM 1 FROM public.bank_transactions WHERE id=r.transaction_id FOR UPDATE;
 SELECT * INTO r FROM public.bank_reconciliations WHERE id=p_riconciliazione FOR UPDATE;
 IF r.unmatched_at IS NULL THEN
  UPDATE public.prima_nota_entries SET bank_transaction_id=NULL WHERE id=r.prima_nota_id AND company_id=r.company_id AND bank_transaction_id=r.transaction_id;
  UPDATE public.bank_reconciliations SET unmatched_at=now(),unmatch_reason='Prova bancaria scollegata: pagamento conservato' WHERE id=r.id;
 END IF;
 RETURN jsonb_build_object('tipo','pagamento_esistente','pagamento_conservato',true);
END $$;
REVOKE ALL ON FUNCTION public.bank_scollega_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_scollega_pagamento(uuid) TO authenticated;
-- Every existing unlink entry point must preserve a previously recorded payment.
DO $$ DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('public.scollega_riga_ripartita(uuid)'::regprocedure);
 IF strpos(d,'bank_scollega_pagamento')=0 THEN
 n:=replace(d,'IF NOT rc.ripartita THEN',E'IF rc.prima_nota_id IS NOT NULL THEN RETURN public.bank_scollega_pagamento(rc.id); END IF;\n  IF NOT rc.ripartita THEN');
 IF n=d THEN RAISE EXCEPTION 'Rivedere il punto di scollegamento della riconciliazione';END IF;EXECUTE n;
 END IF;
END $$;

ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS proposta_controllata_at timestamptz;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS proposta_rifiutata_at timestamptz;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS proposta_rifiutata_da uuid;
CREATE INDEX IF NOT EXISTS bank_proposte_pending_scan_idx ON public.bank_transactions(company_id,proposta_controllata_at,booking_date DESC,id) WHERE status='booked' AND currency='EUR' AND reconciliation_status='pending';
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
 WHERE NOT EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL AND (old.invoice_id=c.id OR old.documento_id=c.id OR old.scadenza_id=c.id OR EXISTS(SELECT 1 FROM public.prima_nota_entries op WHERE op.id=old.prima_nota_id AND op.company_id=p_company AND (op.documento_fiscale_id=c.id OR op.invoice_id=c.id OR op.scadenza_id=c.id)) OR EXISTS(SELECT 1 FROM public.scadenze si WHERE si.id=old.scadenza_id AND si.company_id=p_company AND si.invoice_id=c.id) OR EXISTS(SELECT 1 FROM public.movimenti_cassa_native mc WHERE mc.id=old.movimento_id AND mc.company_id=p_company AND mc.documento_id=c.id) OR EXISTS(SELECT 1 FROM public.scadenze sc WHERE sc.id=old.scadenza_id AND sc.company_id=p_company AND strpos(coalesce(sc.notes,''),'[DOC:'||c.id||']')>0))) AND ((length(regexp_replace(c.title,'[^[:alnum:]]','','g'))>=4 AND strpos(lower(regexp_replace(coalesce(t.description,''),'[^[:alnum:]]','','g')),lower(regexp_replace(c.title,'[^[:alnum:]]','','g')))>0)
 OR (length(c.party)>=4 AND strpos(lower(concat_ws(' ',t.creditor_name,t.debtor_name,t.description)),lower(c.party))>0))
 GROUP BY t.id), changed AS(UPDATE public.bank_transactions t SET proposta_controllata_at=now(),reconciliation_status=CASE WHEN m.ids IS NOT NULL THEN 'suggestion' ELSE t.reconciliation_status END,reconciliation_suggestions=coalesce(m.ids,t.reconciliation_suggestions) FROM tx scan LEFT JOIN matches m ON m.id=scan.id WHERE t.id=scan.id AND t.company_id=p_company AND t.reconciliation_status='pending' RETURNING m.ids IS NOT NULL suggested)
 SELECT count(*) FILTER(WHERE suggested) INTO n FROM changed;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bank_suggerisci_riconciliazioni(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_suggerisci_riconciliazioni(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bank_scarta_suggerimento(p_company uuid,p_tx uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 UPDATE public.bank_transactions SET reconciliation_status='pending',reconciliation_suggestions=NULL,proposta_rifiutata_at=now(),proposta_rifiutata_da=auth.uid()
 WHERE id=p_tx AND company_id=p_company AND reconciliation_status='suggestion';
 IF NOT FOUND THEN RAISE EXCEPTION 'Suggerimento non più disponibile: ricarica il movimento';END IF;
END $$;
REVOKE ALL ON FUNCTION public.bank_scarta_suggerimento(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_scarta_suggerimento(uuid,uuid) TO authenticated;

-- The private bank fields stay immutable; these new operator fields are only
-- writable through the guarded procedures (no new column grants).
DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.bank_transaction_operator_guard()'::regprocedure);
 IF strpos(d,'operativita_revision')=0 THEN
 n:=replace(d,$old$'chiuso_senza_documento']$old$,$new$'chiuso_senza_documento','operativita_revision','proposta_rifiutata_at','proposta_rifiutata_da','proposta_controllata_at']$new$);
 IF n=d THEN RAISE EXCEPTION 'Rivedere la protezione dei dati bancari';END IF;EXECUTE n;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bank_movimento_dettaglio(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 PERFORM private.bank_operativa_access(p_company,false);
 SELECT jsonb_build_object('id',t.id,'account_id',t.account_id,'account_name',coalesce(a.display_name,a.account_name,'Conto'),'booking_date',t.booking_date,'value_date',t.value_date,'amount',CASE WHEN t.metadata->>'provider'='saltedge' AND t.metadata->>'currency_code'=t.currency AND jsonb_typeof(t.metadata->'amount')='number' THEN (t.metadata->>'amount')::numeric ELSE t.amount END,'currency',t.currency,'description',t.description,'creditor_name',t.creditor_name,'debtor_name',t.debtor_name,'creditor_iban',t.creditor_iban,'debtor_iban',t.debtor_iban,'reference',t.reference,'transaction_type',t.transaction_type,'status',t.status,'category',t.category,'note',t.note,'reconciliation_status',t.reconciliation_status,'chiuso_senza_documento',t.chiuso_senza_documento,'links',private.bank_movimento_links(p_company,t.id)) INTO result
 FROM public.bank_transactions_operativi t LEFT JOIN public.bank_accounts_operativi a ON a.id=t.account_id AND a.company_id=t.company_id WHERE t.company_id=p_company AND t.id=p_tx;
 IF result IS NULL THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bank_movimento_dettaglio(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_movimento_dettaglio(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_conferma_ripartizione(p_company uuid,p_tx uuid,p_rows jsonb,p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions;BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text,2810));
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND OR t.status IS DISTINCT FROM 'booked' THEN RAISE EXCEPTION 'Il movimento deve essere contabilizzato dalla banca prima della conferma';END IF;
 IF EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.bank_transaction_id=t.id AND p.company_id=p_company AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=t.id AND r.unmatched_at IS NULL AND (r.prima_nota_id=p.id OR r.movimento_id=p.movimento_id OR r.scadenza_id=p.scadenza_id OR r.invoice_id=p.invoice_id))) THEN RAISE EXCEPTION 'Esistono pagamenti precedenti da verificare prima di aggiungere quote';END IF;
 RETURN public.riconcilia_movimento_su_documenti(t.id,p_rows,p_note);
END $$;
REVOKE ALL ON FUNCTION public.bank_conferma_ripartizione(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_conferma_ripartizione(uuid,uuid,jsonb,text) TO authenticated;

-- The new proof target obeys the same tenant boundary as documents and costs.
DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.bank_reconciliation_tenant_guard()'::regprocedure);
 IF strpos(d,'''prima_nota_id''')=0 THEN
 n:=replace(d,$old$('transaction_id','bank_transactions')$old$,$new$('prima_nota_id','prima_nota_entries'),('transaction_id','bank_transactions')$new$);
 n:=replace(n,'BEGIN',E'BEGIN\n IF (NEW.prima_nota_id IS NOT NULL OR (TG_OP=\'UPDATE\' AND OLD.prima_nota_id IS NOT NULL)) AND current_user IN(\'authenticated\',\'anon\') THEN RAISE EXCEPTION \'Usa la procedura di collegamento dei pagamenti\' USING ERRCODE=\'42501\';END IF;');
 IF n=d THEN RAISE EXCEPTION 'Rivedere la protezione della prova bancaria';END IF;EXECUTE n;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';

-- Older annotation editors and categorization rules participate in conflict detection too.
CREATE OR REPLACE FUNCTION private.bank_note_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF (NEW.note IS DISTINCT FROM OLD.note OR NEW.category IS DISTINCT FROM OLD.category) AND NEW.operativita_revision=OLD.operativita_revision THEN NEW.operativita_revision:=OLD.operativita_revision+1;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bank_note_revision() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_operativita_revision ON public.bank_transactions;
CREATE TRIGGER bank_operativita_revision BEFORE UPDATE OF note,category ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION private.bank_note_revision();

-- A proof follows the original payment when the ledger removes, corrects or
-- reverses it. This never creates money and never reverses a payment itself.
CREATE OR REPLACE FUNCTION private.bank_proof_payment_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original uuid; co uuid; source_tx uuid; reason text;
BEGIN
 IF TG_OP='INSERT' THEN
  original:=NEW.reversal_of; co:=NEW.company_id; reason:='Pagamento originario stornato';
  IF original IS NULL THEN RETURN NEW;END IF;
 ELSIF TG_OP='DELETE' THEN
  original:=OLD.id;co:=OLD.company_id;reason:='Pagamento originario rimosso';
 ELSE
  IF NEW.amount IS NOT DISTINCT FROM OLD.amount AND NEW.direction IS NOT DISTINCT FROM OLD.direction AND NEW.bank_transaction_id IS NOT DISTINCT FROM OLD.bank_transaction_id THEN RETURN NEW;END IF;
  original:=OLD.id;co:=OLD.company_id;reason:='Pagamento o prova bancaria modificati';
 END IF;
 SELECT transaction_id INTO source_tx FROM public.bank_reconciliations WHERE company_id=co AND prima_nota_id=original AND unmatched_at IS NULL LIMIT 1;
 IF source_tx IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 UPDATE public.bank_reconciliations SET unmatched_at=now(),unmatch_reason=reason,prima_nota_id=CASE WHEN TG_OP='DELETE' THEN NULL ELSE prima_nota_id END WHERE company_id=co AND prima_nota_id=original AND unmatched_at IS NULL;
 IF TG_OP='INSERT' THEN
  UPDATE public.prima_nota_entries SET bank_transaction_id=NULL WHERE id=original AND company_id=co AND bank_transaction_id=source_tx;
 ELSIF TG_OP='UPDATE' AND NEW.bank_transaction_id=source_tx THEN NEW.bank_transaction_id:=NULL;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION private.bank_proof_payment_lifecycle() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_proof_payment_removed ON public.prima_nota_entries;
CREATE TRIGGER bank_proof_payment_removed BEFORE DELETE OR UPDATE OF amount,direction,bank_transaction_id ON public.prima_nota_entries FOR EACH ROW EXECUTE FUNCTION private.bank_proof_payment_lifecycle();
DROP TRIGGER IF EXISTS bank_proof_payment_reversed ON public.prima_nota_entries;
CREATE TRIGGER bank_proof_payment_reversed AFTER INSERT ON public.prima_nota_entries FOR EACH ROW WHEN(NEW.reversal_of IS NOT NULL) EXECUTE FUNCTION private.bank_proof_payment_lifecycle();
