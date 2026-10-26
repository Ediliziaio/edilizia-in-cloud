-- Le misure del pannello fotovoltaico (26/10/2026).
--
-- Il piano di posa dei pannelli sul tetto disegna i moduli in scala: servono lunghezza e larghezza del pannello
-- SCELTO nel preventivo, in millimetri, come sulla scheda tecnica. Vuote = il piano le stima dalla potenza.
--
-- Colonne vuote e senza default: nessuna riga viene riscritta, nessun articolo cambia. Idempotente.
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS lunghezza_mm integer;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS larghezza_mm integer;

ALTER TABLE public.articoli_native DROP CONSTRAINT IF EXISTS articoli_native_misure_pannello_valide;
ALTER TABLE public.articoli_native ADD CONSTRAINT articoli_native_misure_pannello_valide CHECK (
  (lunghezza_mm IS NULL OR lunghezza_mm BETWEEN 500 AND 3200)
  AND (larghezza_mm IS NULL OR larghezza_mm BETWEEN 500 AND 3200)
);

COMMENT ON COLUMN public.articoli_native.lunghezza_mm IS 'Lunghezza del pannello FV in mm (scheda tecnica). NULL = il piano di posa stima le misure dalla potenza.';
COMMENT ON COLUMN public.articoli_native.larghezza_mm IS 'Larghezza del pannello FV in mm (scheda tecnica). NULL = il piano di posa stima le misure dalla potenza.';
