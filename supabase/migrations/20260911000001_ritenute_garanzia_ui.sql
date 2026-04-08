-- Aggiunge percentuale_applicata su ritenute_garanzia
-- Aggiunge ritenuta_garanzia_pct su contratti_subappalto se manca

ALTER TABLE public.ritenute_garanzia
  ADD COLUMN IF NOT EXISTS percentuale_applicata NUMERIC(5,2);

ALTER TABLE public.contratti_subappalto
  ADD COLUMN IF NOT EXISTS ritenuta_garanzia_pct NUMERIC(5,2) DEFAULT 5.00;
