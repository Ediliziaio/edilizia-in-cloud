-- Aggiunge media configurabili per macro-categorie prodotto del PDF Fotovoltaico.
-- Esempio JSON:
-- {
--   "pannello": { "label": "Moduli FV premium", "description": "...", "image_url": "https://..." },
--   "inverter": { "label": "Inverter ibrido", "description": "...", "image_url": "https://..." }
-- }

ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS categorie_prodotto_media jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.fv_template_pdf.categorie_prodotto_media IS
  'Media e testi commerciali per le macro-categorie prodotto FV mostrate nel PDF preventivo.';
