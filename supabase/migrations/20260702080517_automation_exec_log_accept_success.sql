-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- FIX REGISTRO CIECO: il motore (process-automation) logga status='success' ma
-- il CHECK accettava solo ok|error|skipped → OGNI insert di log riuscito
-- falliva in silenzio da sempre (errore mai controllato) → i tab
-- Registro/Cronologia del builder erano SEMPRE vuoti. La UI (WorkflowRegistro)
-- si aspetta proprio 'success' → allarghiamo il vincolo.
ALTER TABLE public.automation_execution_log DROP CONSTRAINT automation_execution_log_status_check;
ALTER TABLE public.automation_execution_log ADD CONSTRAINT automation_execution_log_status_check
  CHECK (status = ANY (ARRAY['ok'::text, 'success'::text, 'error'::text, 'skipped'::text]));
