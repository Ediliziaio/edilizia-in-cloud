-- FIX 17 (A1+A2) Sprint AI Hardening 1
-- Estende ai_call_ledger.status per chiudere il gap di audit:
--   - 'skipped': chiamate AI con skipCharge=true (system tasks, audit-trail only)
--   - 'unbilled_fail_open': chargeFailOpen=true MA il charge_ai_call ha fallito
--                          (la risposta è stata servita ma il ledger non è stato
--                          aggiornato dalla RPC; entry diretto a posteriori).
--
-- Motivazione: senza questi status, le chiamate "skipCharge" o quelle servite
-- in fail-open NON appaiono nel ledger → audit incompleto + revenue assurance gap.

ALTER TABLE public.ai_call_ledger
  DROP CONSTRAINT IF EXISTS ai_call_ledger_status_check;

ALTER TABLE public.ai_call_ledger
  ADD CONSTRAINT ai_call_ledger_status_check
  CHECK (status IN ('success', 'error', 'timeout', 'refunded', 'skipped', 'unbilled_fail_open'));

COMMENT ON COLUMN public.ai_call_ledger.status IS
  'success | error | timeout | refunded | skipped (skipCharge=true, audit only) | unbilled_fail_open (charge RPC fallito ma response servita)';

-- Index per identificare rapidamente le entry "anomale" che richiedono attenzione
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_unbilled_alert
  ON public.ai_call_ledger(created_at DESC)
  WHERE status = 'unbilled_fail_open';
