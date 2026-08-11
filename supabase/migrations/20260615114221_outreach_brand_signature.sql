-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS footer_address text;
