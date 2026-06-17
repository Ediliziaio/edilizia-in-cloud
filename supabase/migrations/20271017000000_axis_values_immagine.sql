-- Immagine/foto propria della variante (article_family_axis_values): usata nel
-- preventivatore e nella scheda articolo quando quella variante è selezionata.
-- Se assente, si usa l'immagine della famiglia. Opzionale.
ALTER TABLE public.article_family_axis_values
  ADD COLUMN IF NOT EXISTS immagine_url text;
COMMENT ON COLUMN public.article_family_axis_values.immagine_url IS
  'URL pubblico immagine propria della variante (bucket article-images). Se assente si usa quella della famiglia.';
