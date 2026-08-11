-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Permette a company_admin e super_admin di leggere TUTTE le connessioni email
-- OAuth (Gmail/Outlook/IMAP) della propria azienda, non solo le proprie.
-- Serve per la vista "Account email aziendali" in /azienda/impostazioni/integrazioni.
--
-- Le policy RLS sono ADDITIVE: questa nuova policy si somma a
-- `email_oauth_owner_manage_personal` (ALL su user_id=auth.uid()),
-- `email_oauth_platform_team` (per super_admin/platform_*),
-- `email_oauth_service_all` (service role per edge functions).
--
-- Pattern auth.uid() wrappato in subquery come da convention RLS InitPlan optimization.
--
-- SICUREZZA: i token criptati (access_token_enc, refresh_token_enc, password_enc)
-- restano illegibili senza la master key server-side. Anche se l'admin esegue
-- SELECT * tramite client, vede bytea cifrato non utilizzabile. Comunque il
-- frontend CompanyEmailsOverview seleziona solo colonne non-sensibili.

CREATE POLICY "email_oauth_select_company_admin"
  ON public.email_oauth_connections
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id 
      FROM public.profiles p 
      WHERE p.id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role IN ('company_admin', 'super_admin')
    )
  );

COMMENT ON POLICY "email_oauth_select_company_admin" ON public.email_oauth_connections IS
  'Admin azienda vede tutte le connessioni email OAuth dei propri utenti — vista panoramica /integrazioni';
