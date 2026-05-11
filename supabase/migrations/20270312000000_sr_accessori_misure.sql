-- Aggiunge campi misura (larghezza/altezza) agli accessori del preventivo
-- serramenti.
--
-- Use case principale: feature "Copia misure dai serramenti" del wizard.
-- L'utente crea tapparelle/cassonetti/persiane in batch, ereditando
-- larghezza × altezza dai serramenti del BOM. Senza questi campi le
-- misure venivano scritte nella descrizione testuale → impossibili da
-- editare puntualmente o riusare per calcoli m².
--
-- Idempotente.

ALTER TABLE public.sr_accessori_progetto
  ADD COLUMN IF NOT EXISTS larghezza_mm INTEGER,
  ADD COLUMN IF NOT EXISTS altezza_mm INTEGER;

COMMENT ON COLUMN public.sr_accessori_progetto.larghezza_mm IS
  'Larghezza in mm dell''accessorio. NULL = non applicabile (es. accessori a corpo).';

COMMENT ON COLUMN public.sr_accessori_progetto.altezza_mm IS
  'Altezza in mm dell''accessorio. NULL = non applicabile.';

NOTIFY pgrst, 'reload schema';
