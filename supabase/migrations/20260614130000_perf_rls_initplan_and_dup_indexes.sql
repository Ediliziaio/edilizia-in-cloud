-- ============================================================================
-- Performance: RLS InitPlan + indici duplicati
-- Fonte: Supabase performance advisor (3x auth_rls_initplan, 2x duplicate_index).
-- Logica RLS IDENTICA all'originale: cambia solo la strategia di valutazione
-- (auth.uid() valutata una volta per query invece che per riga).
-- ============================================================================

-- conversazioni.conversazioni_company_rw
DROP POLICY IF EXISTS conversazioni_company_rw ON public.conversazioni;
CREATE POLICY conversazioni_company_rw ON public.conversazioni
  FOR ALL TO authenticated
  USING (is_super_admin() OR (company_id = get_user_company_id((select auth.uid()))))
  WITH CHECK (is_super_admin() OR (company_id = get_user_company_id((select auth.uid()))));

-- company_branding.produttore_manage_own_branding
DROP POLICY IF EXISTS produttore_manage_own_branding ON public.company_branding;
CREATE POLICY produttore_manage_own_branding ON public.company_branding
  FOR ALL TO authenticated
  USING ((company_id = get_user_company_id((select auth.uid()))) AND has_role((select auth.uid()), 'produttore_admin'::app_role))
  WITH CHECK ((company_id = get_user_company_id((select auth.uid()))) AND has_role((select auth.uid()), 'produttore_admin'::app_role));

-- companies.companies_produttore_vede_rivenditori
DROP POLICY IF EXISTS companies_produttore_vede_rivenditori ON public.companies;
CREATE POLICY companies_produttore_vede_rivenditori ON public.companies
  FOR SELECT TO authenticated
  USING (
    (parent_company_id IS NOT NULL)
    AND (parent_company_id = get_user_company_id((select auth.uid())))
    AND (
      has_role((select auth.uid()), 'company_admin'::app_role)
      OR has_role((select auth.uid()), 'produttore_admin'::app_role)
    )
  );

-- Indici duplicati identici: rimosso il ridondante (write più veloci, meno spazio).
DROP INDEX IF EXISTS public.idx_call_logs_user;            -- resta idx_call_logs_user_id
DROP INDEX IF EXISTS public.ix_marketing_contacts_tel_norm; -- resta idx_marketing_contacts_tel_normalized
