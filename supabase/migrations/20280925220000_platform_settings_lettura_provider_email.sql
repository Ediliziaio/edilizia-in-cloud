-- Lettura di email_transactional_provider dal browser (applicata il 25/09/2026).
--
-- File ricostruito il 25/09/2026 da supabase_migrations.schema_migrations.statements:
-- la migrazione era stata applicata via MCP senza salvare il file, e Supabase
-- Preview era rosso («Remote migration versions not found»). Il testo qui sotto
-- è identico a quello registrato nel database.

DROP POLICY IF EXISTS platform_settings_lettura_authenticated ON public.platform_settings;
CREATE POLICY platform_settings_lettura_authenticated ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key = ANY (ARRAY['meta_app_id', 'referral_commission_policy', 'email_transactional_provider']));
