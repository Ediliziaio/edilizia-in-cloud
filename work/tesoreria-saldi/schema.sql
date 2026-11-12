SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS can_view_bank_balances boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS can_reconcile_bank_transactions boolean NOT NULL DEFAULT false;
-- One-time compatibility backfill. A repeat execution never restores a revoked permission.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_description WHERE objoid='public.staff_permissions'::regclass AND objsubid=(SELECT attnum FROM pg_attribute WHERE attrelid='public.staff_permissions'::regclass AND attname='can_view_bank_balances') AND description LIKE '%bank-permissions-v1%') THEN
  UPDATE public.staff_permissions SET can_view_bank_balances = can_view_tesoreria OR can_view_forecast OR can_view_controllo_gestione OR can_view_cruscotto OR can_view_financial_reports,
   can_reconcile_bank_transactions = can_view_tesoreria AND NOT sola_lettura;
  COMMENT ON COLUMN public.staff_permissions.can_view_bank_balances IS 'Saldo contabile, disponibile, apertura e liquidità; bank-permissions-v1';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.puo_vedere_saldi_bancari(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.role()='service_role',false) OR (
  auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND (
   public.has_permission_for_company(auth.uid(),'can_view_bank_balances',p_company)
   OR public.user_can_read_accountant_company(p_company)))
$$;
CREATE OR REPLACE FUNCTION public.puo_riconciliare_banca(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.role()='service_role',false) OR (
  auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND (
   (public.has_permission_for_company(auth.uid(),'can_view_tesoreria',p_company)
    AND public.has_permission_for_company(auth.uid(),'can_reconcile_bank_transactions',p_company)
    AND NOT EXISTS(SELECT 1 FROM public.staff_permissions s WHERE s.user_id=auth.uid() AND s.company_id=p_company AND s.sola_lettura))
   OR public.user_can_write_accountant_company(p_company)))
$$;
CREATE OR REPLACE FUNCTION public.richiedi_saldi_bancari(p_company uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(public.puo_vedere_saldi_bancari(p_company),false) THEN
  RAISE EXCEPTION 'Non hai il permesso di consultare saldi bancari e liquidità' USING ERRCODE='42501';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.richiedi_riconciliazione_banca(p_company uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT coalesce(public.puo_riconciliare_banca(p_company),false) THEN
  RAISE EXCEPTION 'Non hai il permesso di riconciliare i movimenti bancari' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.puo_vedere_saldi_bancari(uuid),public.puo_riconciliare_banca(uuid),public.richiedi_saldi_bancari(uuid),public.richiedi_riconciliazione_banca(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.puo_vedere_saldi_bancari(uuid),public.puo_riconciliare_banca(uuid),public.richiedi_saldi_bancari(uuid),public.richiedi_riconciliazione_banca(uuid) TO authenticated,service_role;
-- The owner view intentionally bypasses column grants, with explicit tenant/actor
-- checks. Masked balances are NULL, never zero; no source JSON is exposed.
CREATE OR REPLACE VIEW public.bank_accounts_operativi WITH(security_barrier=true) AS
 SELECT a.id,a.company_id,a.connection_id,a.external_account_id,a.iban,a.bban,a.account_name,a.account_owner_name,a.account_type,a.currency,
  CASE WHEN r.allowed THEN a.current_balance END AS current_balance,
  CASE WHEN r.allowed THEN a.available_balance END AS available_balance,
  a.balance_updated_at,a.is_active,a.display_name,a.created_at,a.updated_at,a.is_manual,
  CASE WHEN r.allowed THEN a.opening_balance END AS opening_balance
 FROM public.bank_accounts a
 CROSS JOIN LATERAL(SELECT public.puo_vedere_saldi_bancari(a.company_id) AS allowed OFFSET 0) r
 WHERE coalesce(auth.role()='service_role',false) OR (auth.uid() IS NOT NULL AND NOT public.utente_bloccato()
  AND (public.has_permission_for_company(auth.uid(),'can_view_tesoreria',a.company_id)
   OR public.has_permission_for_company(auth.uid(),'can_view_bank_balances',a.company_id)
   OR public.user_can_read_accountant_company(a.company_id)));
REVOKE ALL ON public.bank_accounts_operativi FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bank_accounts_operativi TO authenticated,service_role;
-- Base-table name/IBAN reads (including relationship embeds) remain compatible.
-- Protect columns even when callers bypass the app or request CSV.
REVOKE SELECT ON public.bank_accounts FROM PUBLIC,anon,authenticated;
REVOKE SELECT(current_balance,available_balance,opening_balance) ON public.bank_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,company_id,connection_id,external_account_id,iban,bban,account_name,account_owner_name,account_type,currency,balance_updated_at,is_active,display_name,created_at,updated_at,is_manual) ON public.bank_accounts TO authenticated;
-- Provider metadata may contain a running balance in nested objects. Only the
-- precision/currency fields used by the UI are public to movement-only readers.
DO $$ DECLARE cols text; safe_cols text; BEGIN
 SELECT string_agg(CASE WHEN attname='metadata' THEN
  'CASE WHEN public.puo_vedere_saldi_bancari(t.company_id) THEN t.metadata ELSE jsonb_strip_nulls(jsonb_build_object(''provider'',t.metadata->''provider'',''amount'',t.metadata->''amount'',''currency_code'',t.metadata->''currency_code'')) END AS metadata'
  ELSE format('t.%I',attname) END,',' ORDER BY attnum),
  string_agg(format('%I',attname),',' ORDER BY attnum) FILTER(WHERE attname<>'metadata')
 INTO cols,safe_cols FROM pg_attribute WHERE attrelid='public.bank_transactions'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE 'CREATE OR REPLACE VIEW public.bank_transactions_operativi WITH(security_barrier=true) AS SELECT '||cols||' FROM public.bank_transactions t WHERE coalesce(auth.role()=''service_role'',false) OR (auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND (public.has_permission_for_company(auth.uid(),''can_view_tesoreria'',t.company_id) OR public.user_can_read_accountant_company(t.company_id)))';
 REVOKE ALL ON public.bank_transactions_operativi FROM PUBLIC,anon,authenticated;
 GRANT SELECT ON public.bank_transactions_operativi TO authenticated,service_role;
 REVOKE SELECT ON public.bank_transactions FROM PUBLIC,anon,authenticated;
 REVOKE SELECT(metadata) ON public.bank_transactions FROM PUBLIC,anon,authenticated;
 EXECUTE 'GRANT SELECT('||safe_cols||') ON public.bank_transactions TO authenticated';
END $$;
-- Balance writes must not become an oracle for hidden balances or allow reset.
CREATE OR REPLACE FUNCTION public.bank_balance_write_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF auth.role()='authenticated' AND pg_trigger_depth()=1 AND (TG_OP='INSERT' OR NEW.current_balance IS DISTINCT FROM OLD.current_balance OR NEW.available_balance IS DISTINCT FROM OLD.available_balance OR NEW.opening_balance IS DISTINCT FROM OLD.opening_balance)
 AND NOT public.puo_vedere_saldi_bancari(NEW.company_id) THEN
  RAISE EXCEPTION 'Non puoi modificare i saldi bancari' USING ERRCODE='42501';
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bank_balance_write_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_balance_write_guard ON public.bank_accounts;
CREATE TRIGGER bank_balance_write_guard BEFORE INSERT OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.bank_balance_write_guard();
-- Readers that run as owner must enforce the balance permission explicitly.
DO $$ DECLARE f record; def text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('get_treasury_summary','get_cash_flow_forecast','cg_get_cash_flow_prospettico','cg_get_pfn','cg_get_stato_patrimoniale_riclassificato','silvio_cashflow_forecast_90d','silvio_tool_cashflow_status','silvio_tool_company_kpi','silvio_tool_quadro_incassi') LOOP
  def:=pg_get_functiondef(f.oid);
  IF position('richiedi_saldi_bancari' in def)=0 THEN
   def:=regexp_replace(def,'\m[bB][eE][gG][iI][nN]\M',E'BEGIN\n PERFORM public.richiedi_saldi_bancari(p_company_id);');
   EXECUTE def;
  END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.get_metric(text,jsonb,text,text)'::regprocedure) INTO def;
 IF position('richiedi_saldi_bancari' in def)=0 THEN
  def:=replace(def, 'ELSIF p_metric_id = ''cash_balance'' THEN', E'ELSIF p_metric_id = ''cash_balance'' THEN\n PERFORM public.richiedi_saldi_bancari(v_company_id);');
  EXECUTE def;
 END IF;
END $$;
-- Recompute is a trigger implementation, not a browser API (returns a balance).
REVOKE ALL ON FUNCTION public.bank_account_recompute_manual_balance(uuid) FROM PUBLIC,anon,authenticated;
-- Explicit writes for treasury operators. Original tenant/blocked rules remain.
DO $$ DECLARE t text; cmd text; BEGIN
 FOREACH t IN ARRAY ARRAY['bank_transactions','bank_reconciliations'] LOOP
  FOREACH cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','bank_reconcile_'||lower(cmd),t);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s', 'bank_reconcile_'||lower(cmd),t,cmd,
    CASE WHEN cmd='INSERT' THEN 'WITH CHECK(public.puo_riconciliare_banca(company_id))'
     WHEN cmd='UPDATE' THEN 'USING(public.puo_riconciliare_banca(company_id)) WITH CHECK(public.puo_riconciliare_banca(company_id))'
     ELSE 'USING(public.puo_riconciliare_banca(company_id))' END);
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','bank_reconcile_guard_'||lower(cmd),t);
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s','bank_reconcile_guard_'||lower(cmd),t,cmd,
    CASE WHEN cmd='INSERT' THEN 'WITH CHECK(public.puo_riconciliare_banca(company_id))'
     WHEN cmd='UPDATE' THEN 'USING(public.puo_riconciliare_banca(company_id)) WITH CHECK(public.puo_riconciliare_banca(company_id))'
     ELSE 'USING(public.puo_riconciliare_banca(company_id))' END);
  END LOOP;
 END LOOP;
END $$;
-- Reconciliation does not grant permission to rewrite imported bank amounts.
CREATE OR REPLACE FUNCTION public.bank_transaction_operator_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_company uuid; row_account uuid; manual_account boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN coalesce(NEW,OLD); END IF;
 row_company:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 row_account:=CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END;
 IF public.has_permission_for_company(auth.uid(),'__solo_amministratori__',row_company) THEN RETURN coalesce(NEW,OLD); END IF;
 SELECT is_manual INTO manual_account FROM public.bank_accounts WHERE id=row_account AND company_id=row_company;
 IF NOT coalesce(manual_account,false) AND (TG_OP IN ('INSERT','DELETE') OR
   (to_jsonb(NEW)-ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento'])) THEN
  RAISE EXCEPTION 'I dati importati dalla banca non si possono riscrivere' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
  RAISE EXCEPTION 'Non puoi spostare un movimento tra conti o aziende' USING ERRCODE='42501';
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.bank_transaction_operator_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_transaction_operator_guard ON public.bank_transactions;
CREATE TRIGGER bank_transaction_operator_guard BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.bank_transaction_operator_guard();
-- Existing document/payment authorization stays in each RPC; this is additional.
DO $$ DECLARE f record; def text; company_expr text; BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('chiudi_movimento_senza_fattura','riapri_movimento_senza_fattura','riconcilia_bonifico_fattura','riconcilia_bonifico_parlante','riconcilia_movimento_su_documenti','riconcilia_uscita_scadenza','scollega_bonifico_fattura','scollega_riga_ripartita','scollega_uscita_scadenza','apply_bank_categorization_rules') LOOP
  def:=pg_get_functiondef(f.oid);
  IF position('richiedi_riconciliazione_banca' in def)>0 THEN CONTINUE; END IF;
  company_expr:=CASE
   WHEN 'p_company_id'=ANY(f.proargnames) THEN 'p_company_id'
   WHEN 'p_transaction_id'=ANY(f.proargnames) THEN '(SELECT company_id FROM public.bank_transactions WHERE id=p_transaction_id)'
   WHEN 'p_transazione'=ANY(f.proargnames) THEN '(SELECT company_id FROM public.bank_transactions WHERE id=p_transazione)'
   WHEN 'p_reconciliation_id'=ANY(f.proargnames) THEN '(SELECT company_id FROM public.bank_reconciliations WHERE id=p_reconciliation_id)'
   WHEN 'p_riconciliazione'=ANY(f.proargnames) THEN '(SELECT company_id FROM public.bank_reconciliations WHERE id=p_riconciliazione)'
   ELSE NULL END;
  IF company_expr IS NULL THEN RAISE EXCEPTION 'Missing bank permission scope for %',f.proname; END IF;
  EXECUTE regexp_replace(def,'\m[bB][eE][gG][iI][nN]\M','BEGIN'||chr(10)||' PERFORM public.richiedi_riconciliazione_banca('||company_expr||');');
 END LOOP;
END $$;
-- Stored forecast results reveal current balances too.
DROP POLICY IF EXISTS bank_balances_snapshot_read ON public.cashflow_forecast_snapshots;
CREATE POLICY bank_balances_snapshot_read ON public.cashflow_forecast_snapshots AS RESTRICTIVE FOR SELECT TO authenticated USING(public.puo_vedere_saldi_bancari(company_id));
-- Previously generated cash alerts must also disappear after revocation.
DROP POLICY IF EXISTS bank_balances_lifecycle_read ON public.lifecycle_notifications;
CREATE POLICY bank_balances_lifecycle_read ON public.lifecycle_notifications AS RESTRICTIVE FOR SELECT TO authenticated USING(notification_type <> 'cash_flow_alert' OR public.puo_vedere_saldi_bancari(company_id));
NOTIFY pgrst,'reload schema';
