-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Estende la riconciliazione bancaria alle USCITE (pagamenti fornitori → scadenze).
-- Prima si poteva collegare una transazione solo a una fattura (incassi).
ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS linked_scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_scadenza
  ON public.bank_reconciliations(scadenza_id) WHERE scadenza_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_linked_scadenza
  ON public.bank_transactions(linked_scadenza_id) WHERE linked_scadenza_id IS NOT NULL;

COMMENT ON COLUMN public.bank_reconciliations.scadenza_id IS 'Riconciliazione di una USCITA: transazione debit → scadenza fornitore.';
