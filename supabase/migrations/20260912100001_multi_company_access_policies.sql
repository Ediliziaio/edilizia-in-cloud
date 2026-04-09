-- ============================================================================
-- FIX P0/P1: multi_company_access policy coverage
-- Data: 2026-04-09
-- ============================================================================
-- Stato pre-fix:
--   - super_admin_full_access (FOR ALL, senza WITH CHECK)
--   - multi_company_user_read_own (FOR SELECT, user_id = auth.uid())
-- Gap: i company_admin non possono leggere/concedere accessi multi-azienda
-- per la propria company. Unica via: service role via edge function, ma
-- nessun meccanismo lato UI. Aggiungiamo policy admin-scoped sicure.
-- ============================================================================

-- Super admin: aggiungiamo WITH CHECK esplicito per hygiene
DROP POLICY IF EXISTS "super_admin_full_access" ON public.multi_company_access;
CREATE POLICY "super_admin_full_access"
  ON public.multi_company_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Company admin: SELECT delle righe della propria company
DROP POLICY IF EXISTS "company_admin_read_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_read_own_company_access"
  ON public.multi_company_access
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- Company admin: INSERT accessi multi-company verso la propria company,
-- solo per utenti esistenti (no user_id fittizi)
DROP POLICY IF EXISTS "company_admin_grant_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_grant_own_company_access"
  ON public.multi_company_access
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = multi_company_access.user_id)
  );

-- Company admin: DELETE accessi della propria company
DROP POLICY IF EXISTS "company_admin_revoke_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_revoke_own_company_access"
  ON public.multi_company_access
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
  );
