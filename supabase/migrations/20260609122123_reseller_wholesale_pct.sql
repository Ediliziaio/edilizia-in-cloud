-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Sconto wholesale % (0-100) che il PRODUTTORE (azienda agency) ottiene sul prezzo
-- di listino dei rivenditori che paga lui (comped). 0 = listino pieno. Lo imposta
-- il super admin. Base della "Fase 3 — Il conto del produttore".
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reseller_wholesale_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_reseller_wholesale_pct_chk;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_reseller_wholesale_pct_chk
  CHECK (reseller_wholesale_pct >= 0 AND reseller_wholesale_pct <= 100);

COMMENT ON COLUMN public.companies.reseller_wholesale_pct IS
  'Sconto wholesale % (0-100) del produttore agency sul listino dei rivenditori comped. Impostato dal super admin.';
