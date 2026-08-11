-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Tetto rivenditori creabili da un produttore (0 = illimitato). Impostato dal super admin.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reseller_limit integer NOT NULL DEFAULT 0;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_reseller_limit_chk;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_reseller_limit_chk CHECK (reseller_limit >= 0);

COMMENT ON COLUMN public.companies.reseller_limit IS
  'Max rivenditori creabili dal produttore (0 = illimitato). Impostato dal super admin.';
