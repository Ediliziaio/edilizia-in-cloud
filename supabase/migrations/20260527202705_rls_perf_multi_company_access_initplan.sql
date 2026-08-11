-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PERF: wrappa auth.uid() su 5 policy di multi_company_access (59k reads).
-- Semantica IDENTICA, solo InitPlan optimization.

DROP POLICY IF EXISTS "multi_company_user_read_own" ON public.multi_company_access;
CREATE POLICY "multi_company_user_read_own"
  ON public.multi_company_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "company_admin_read_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_read_own_company_access"
  ON public.multi_company_access FOR SELECT TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = get_user_company_id((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "company_admin_grant_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_grant_own_company_access"
  ON public.multi_company_access FOR INSERT TO authenticated
  WITH CHECK (
    has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = multi_company_access.user_id)
  );

DROP POLICY IF EXISTS "company_admin_revoke_own_company_access" ON public.multi_company_access;
CREATE POLICY "company_admin_revoke_own_company_access"
  ON public.multi_company_access FOR DELETE TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND company_id = get_user_company_id((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "super_admin_full_access" ON public.multi_company_access;
CREATE POLICY "super_admin_full_access"
  ON public.multi_company_access FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));
