-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Sicurezza Open Banking: la VISUALIZZAZIONE di conti e connessioni bancarie
-- deve essere riservata ad admin o a chi ha il permesso Tesoreria
-- (can_view_tesoreria), esattamente come già fatto per bank_transactions.
-- Prima: qualsiasi membro dell'azienda poteva leggere conti e connessioni.

DROP POLICY IF EXISTS "Company users can view own bank connections" ON public.bank_connections;
CREATE POLICY "Company users can view own bank connections"
  ON public.bank_connections FOR SELECT
  USING (
    (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())))
    AND (
      has_role((SELECT auth.uid()), 'super_admin'::app_role)
      OR has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR has_permission((SELECT auth.uid()), 'can_view_tesoreria')
    )
  );

DROP POLICY IF EXISTS "Company users can view own bank accounts" ON public.bank_accounts;
CREATE POLICY "Company users can view own bank accounts"
  ON public.bank_accounts FOR SELECT
  USING (
    (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())))
    AND (
      has_role((SELECT auth.uid()), 'super_admin'::app_role)
      OR has_role((SELECT auth.uid()), 'company_admin'::app_role)
      OR has_permission((SELECT auth.uid()), 'can_view_tesoreria')
    )
  );
