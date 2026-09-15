-- Preventivo serramenti: la profondità dei complementi (il cassonetto).
--
-- Nel box di ogni finestra i complementi prendono le misure della finestra; il
-- cassonetto si misura anche in profondità, che prima non aveva dove stare. Il
-- prezzo resta quello del listino (a pezzo, a m², a griglia): la profondità si
-- scrive nel preventivo e nel PDF.
--
-- Una colonna facoltativa e un controllo: nessuna riga riscritta.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.sr_accessori_progetto
  ADD COLUMN IF NOT EXISTS profondita_mm integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sr_accessori_progetto_profondita_positiva'
       AND conrelid = 'public.sr_accessori_progetto'::regclass
  ) THEN
    ALTER TABLE public.sr_accessori_progetto
      ADD CONSTRAINT sr_accessori_progetto_profondita_positiva
      CHECK (profondita_mm IS NULL OR profondita_mm > 0);
  END IF;
END $$;
