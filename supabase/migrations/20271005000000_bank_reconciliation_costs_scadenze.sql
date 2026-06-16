-- ============================================================================
-- Riconciliazione bancaria USCITE (pagamenti fornitori → scadenze) — già via MCP
-- ============================================================================
-- Prima una transazione si poteva collegare solo a una fattura (incassi).
-- Ora anche a una scadenza in uscita (pagamento fornitore).
-- ============================================================================
ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS linked_scadenza_id uuid REFERENCES public.scadenze(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_scadenza
  ON public.bank_reconciliations(scadenza_id) WHERE scadenza_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_linked_scadenza
  ON public.bank_transactions(linked_scadenza_id) WHERE linked_scadenza_id IS NOT NULL;

COMMENT ON COLUMN public.bank_reconciliations.scadenza_id IS 'Riconciliazione di una USCITA: transazione debit → scadenza fornitore.';
