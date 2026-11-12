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
 SELECT coalesce(auth.role()='service_role',false) OR (auth.uid() IS NULL AND coalesce(auth.role(),'')='' AND session_user IN ('postgres','supabase_admin')) OR (
  auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND (
   public.has_permission_for_company(auth.uid(),'can_view_bank_balances',p_company)
   OR public.user_can_read_accountant_company(p_company)))
$$;
CREATE OR REPLACE FUNCTION public.puo_riconciliare_banca(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(auth.role()='service_role',false) OR (auth.uid() IS NULL AND coalesce(auth.role(),'')='' AND session_user IN ('postgres','supabase_admin')) OR (
  auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND (
   public.has_permission_for_company(auth.uid(),'__solo_amministratori__',p_company) OR
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
END $$;
NOTIFY pgrst,'reload schema';
