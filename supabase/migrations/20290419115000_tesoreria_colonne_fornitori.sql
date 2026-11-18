-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: un collegamento di banca può puntare a una fattura ricevuta o a una
-- rata del fornitore (18/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Preparazione di 20290419120000_tesoreria_fornitori_e_prove: il vincolo
-- bank_reconciliations_target_check voleva una fattura emessa, una scadenza, un
-- movimento, un documento o la prima nota; un pagamento a fornitore non aveva
-- dove stare. Due colonne vuote (senza FK, come documento_id) e il vincolo che
-- le comprende. Solo aggiunte: nessuna riga cambia. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS fattura_ricevuta_id uuid;
ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS rata_fornitore_id uuid;
CREATE INDEX IF NOT EXISTS bank_reconciliations_fattura_ricevuta_idx ON public.bank_reconciliations (fattura_ricevuta_id) WHERE fattura_ricevuta_id IS NOT NULL;

ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_target_check;
ALTER TABLE public.bank_reconciliations ADD CONSTRAINT bank_reconciliations_target_check CHECK (
  unmatched_at IS NOT NULL OR invoice_id IS NOT NULL OR scadenza_id IS NOT NULL OR movimento_id IS NOT NULL
  OR documento_id IS NOT NULL OR prima_nota_id IS NOT NULL OR fattura_ricevuta_id IS NOT NULL OR rata_fornitore_id IS NOT NULL);
