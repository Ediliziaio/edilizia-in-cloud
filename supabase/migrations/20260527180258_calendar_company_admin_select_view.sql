-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Permette a company_admin e super_admin di leggere TUTTE le connessioni
-- calendar (Google + Apple) della propria azienda, non solo le proprie.
-- Serve per la vista panoramica "Calendari aziendali" in /azienda/impostazioni/integrazioni.
--
-- Le policy RLS sono ADDITIVE: questa nuova policy si somma a `gcal_conn_select_personal`
-- (e analoghe Apple). L'utente normale continua a vedere solo le sue righe; un admin
-- vede TUTTE le righe della propria company.
--
-- Pattern auth.uid() wrappato in subquery come da convention RLS InitPlan optimization.

-- ── Google Calendar ─────────────────────────────────────────────────────────
CREATE POLICY "gcal_conn_select_company_admin"
  ON public.google_calendar_connections
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

-- ── Apple Calendar ──────────────────────────────────────────────────────────
-- NB: la policy esistente `apple_calendar_connections_personal` copre ALL (cmd=ALL).
-- Aggiungiamo una policy SELECT separata per gli admin. Quando una policy di tipo
-- ALL e una SELECT-only coesistono, PG applica OR sulle USING di tutte le policy
-- restrittive: l'admin avrà accesso se o è il proprietario, o è admin della company.
CREATE POLICY "apple_cal_conn_select_company_admin"
  ON public.apple_calendar_connections
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

COMMENT ON POLICY "gcal_conn_select_company_admin" ON public.google_calendar_connections IS
  'Admin azienda vede tutte le connessioni Google Calendar dei propri utenti — vista panoramica /integrazioni';

COMMENT ON POLICY "apple_cal_conn_select_company_admin" ON public.apple_calendar_connections IS
  'Admin azienda vede tutte le connessioni Apple Calendar dei propri utenti — vista panoramica /integrazioni';
