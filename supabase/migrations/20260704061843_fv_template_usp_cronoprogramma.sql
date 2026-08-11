-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- FV template PDF: USP (punti di forza) + cronoprogramma personalizzabile.
-- Stessi shape jsonb degli altri verticali:
--   usp            = [{titolo, descrizione}]
--   cronoprogramma = [{fase, durata, descrizione}]
ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS usp jsonb,
  ADD COLUMN IF NOT EXISTS cronoprogramma jsonb;
