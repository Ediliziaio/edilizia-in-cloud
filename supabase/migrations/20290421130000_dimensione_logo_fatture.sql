-- Solo la veste dei documenti: le righe e gli importi delle fatture restano gli stessi.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS scala_logo integer NOT NULL DEFAULT 100
  CONSTRAINT anagrafica_azienda_scala_logo_check CHECK (scala_logo BETWEEN 25 AND 250);

COMMENT ON COLUMN public.anagrafica_azienda.scala_logo IS
  'Dimensione proporzionale del logo nei PDF delle fatture: 25–250%, standard 100%.';
