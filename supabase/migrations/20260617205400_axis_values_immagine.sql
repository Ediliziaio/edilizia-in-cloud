-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- Immagine/foto propria della variante (axis value): usata nel preventivatore
-- e nella scheda articolo quando quella variante è selezionata. Opzionale.
ALTER TABLE public.article_family_axis_values
  ADD COLUMN IF NOT EXISTS immagine_url text;
COMMENT ON COLUMN public.article_family_axis_values.immagine_url IS
  'URL pubblico immagine propria della variante (bucket article-images). Se assente si usa quella della famiglia.';
