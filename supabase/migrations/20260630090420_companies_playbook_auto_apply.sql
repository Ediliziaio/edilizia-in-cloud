-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS playbook_auto_apply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.playbook_auto_apply IS
  'Se true, alla creazione di una commessa vengono generate automaticamente le attività del Playbook.';
