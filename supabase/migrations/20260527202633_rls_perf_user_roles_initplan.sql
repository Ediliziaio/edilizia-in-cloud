-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PERF: wrappa auth.uid() in (SELECT auth.uid()) sulle 3 policy di user_roles.
-- 
-- user_roles è la tabella più hot del database: 671k reads in una settimana.
-- Ogni query qui esegue 3 RLS check, ciascuno che chiama auth.uid() per ogni
-- riga visitata. Wrappando in (SELECT auth.uid()) il planner Postgres usa
-- InitPlan: auth.uid() viene risolto UNA VOLTA prima della query, non per
-- ogni riga. Stima miglioramento: 10-20% sulla latenza media.
--
-- SICUREZZA: la semantica è IDENTICA — auth.uid() restituisce sempre lo
-- stesso valore in una connessione (è la session JWT user). Non c'è differenza
-- funzionale, solo performance.

-- Policy 1: super_admin manage all
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- Policy 2: users own role
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Policy 3: company_admin view company users
DROP POLICY IF EXISTS "company_admin_view_company_user_roles" ON public.user_roles;
CREATE POLICY "company_admin_view_company_user_roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'company_admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.company_id = get_user_company_id((SELECT auth.uid()))
    )
  );
