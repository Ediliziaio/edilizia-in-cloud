-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Scheda PDF per singola variante: un documento può essere della famiglia
-- (axis_value_id NULL, comportamento attuale) oppure di una specifica variante.
ALTER TABLE public.article_family_documents
  ADD COLUMN IF NOT EXISTS axis_value_id uuid
  REFERENCES public.article_family_axis_values(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_afd_axis_value
  ON public.article_family_documents(axis_value_id) WHERE axis_value_id IS NOT NULL;
COMMENT ON COLUMN public.article_family_documents.axis_value_id IS
  'Se valorizzato, la scheda è legata a questa variante (article_family_axis_values), non alla famiglia.';
