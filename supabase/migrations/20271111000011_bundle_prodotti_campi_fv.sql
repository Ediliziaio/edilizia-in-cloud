-- Bundle/Offerte (bundle_prodotti) come "kit": per il modulo Fotovoltaico un kit
-- è un insieme di prodotti del listino con un PREZZO d'offerta fisso e una taglia
-- (kWp + accumulo). Aggiungo 3 attributi FV opzionali usati solo dai bundle
-- vertical='fotovoltaico': il wizard FV (Fase 5) li legge quando scegli un kit,
-- impostando potenza/accumulo/prezzo senza dimensionare componente-per-componente.
ALTER TABLE public.bundle_prodotti
  ADD COLUMN IF NOT EXISTS fv_kwp numeric,
  ADD COLUMN IF NOT EXISTS fv_accumulo_kwh numeric,
  ADD COLUMN IF NOT EXISTS prezzo_offerta numeric;

COMMENT ON COLUMN public.bundle_prodotti.fv_kwp IS 'FV: potenza del kit in kWp (per analisi produzione/risparmio nel wizard FV)';
COMMENT ON COLUMN public.bundle_prodotti.fv_accumulo_kwh IS 'FV: capacità accumulo del kit in kWh (0/NULL = senza accumulo)';
COMMENT ON COLUMN public.bundle_prodotti.prezzo_offerta IS 'Prezzo d''offerta fisso del kit (override della somma voci − sconto). Usato dal preventivo FV come investimento.';
