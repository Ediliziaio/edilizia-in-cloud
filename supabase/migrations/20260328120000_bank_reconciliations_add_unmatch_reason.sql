-- Fix BUG 3: aggiunge colonna unmatch_reason per tracciare il motivo dello smatch
ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS unmatch_reason text;

COMMENT ON COLUMN public.bank_reconciliations.unmatch_reason
  IS 'Motivo dello smatch (es. importo errato, fattura sbagliata, duplicato)';
