-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


DROP POLICY IF EXISTS "Super admins can manage all lead forms" ON public.lead_forms;
CREATE POLICY "Super admins can manage all lead forms"
  ON public.lead_forms
  FOR ALL
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can view all form submissions" ON public.form_submissions;
CREATE POLICY "Super admins can view all form submissions"
  ON public.form_submissions
  FOR SELECT
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));
