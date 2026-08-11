-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DROP INDEX IF EXISTS public.idx_accountant_company_access_company;
DROP INDEX IF EXISTS public.idx_accountant_company_access_firm;
DROP INDEX IF EXISTS public.idx_accountant_firm_members_user;
DROP INDEX IF EXISTS public.idx_email_logs_campaign;
DROP INDEX IF EXISTS public.idx_google_ads_camp_company;
DROP INDEX IF EXISTS public.idx_subscription_plans_slug_unique;
ALTER TABLE public.reporting_preferences
  DROP CONSTRAINT IF EXISTS reporting_preferences_company_user_key_unique;
