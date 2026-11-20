-- Presentazione dei documenti fiscali: nessuna modifica alle fatture o ai loro importi.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS allineamento_logo text NOT NULL DEFAULT 'left';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.anagrafica_azienda'::regclass
      AND conname = 'anagrafica_azienda_allineamento_logo_check'
  ) THEN
    ALTER TABLE public.anagrafica_azienda
      ADD CONSTRAINT anagrafica_azienda_allineamento_logo_check
      CHECK (allineamento_logo IN ('left', 'center', 'right'));
  END IF;
END $$;

COMMENT ON COLUMN public.anagrafica_azienda.allineamento_logo IS
  'Allineamento del logo nei PDF fiscali: left, center o right. La testata si adatta senza sovrapporre logo e dati.';

NOTIFY pgrst, 'reload schema';
