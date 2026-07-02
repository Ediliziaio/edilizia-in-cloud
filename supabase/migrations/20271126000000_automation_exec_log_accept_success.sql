-- FIX "REGISTRO CIECO": il motore (process-automation) logga status='success'
-- ma il CHECK accettava solo ok|error|skipped → OGNI insert di log riuscito
-- falliva in silenzio da sempre (l'errore non veniva controllato) → i tab
-- Registro/Cronologia del builder risultavano SEMPRE vuoti anche con flussi
-- funzionanti. La UI (WorkflowRegistro) filtra proprio su 'success' → si
-- allarga il vincolo. Applicata in prod via MCP il 2026-07-02.
ALTER TABLE public.automation_execution_log DROP CONSTRAINT automation_execution_log_status_check;
ALTER TABLE public.automation_execution_log ADD CONSTRAINT automation_execution_log_status_check
  CHECK (status = ANY (ARRAY['ok'::text, 'success'::text, 'error'::text, 'skipped'::text]));
