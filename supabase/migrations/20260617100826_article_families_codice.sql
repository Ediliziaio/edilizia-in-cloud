-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS codice text;

CREATE INDEX IF NOT EXISTS idx_article_families_codice
  ON public.article_families (company_id, codice)
  WHERE codice IS NOT NULL;

COMMENT ON COLUMN public.article_families.codice IS
  'Codice articolo / SKU opzionale. Ricercabile in listino, picker commesse e magazzino. Nessun vincolo di unicità.';
