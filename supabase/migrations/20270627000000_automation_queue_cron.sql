-- ============================================================================
-- Motore automazioni: cron che fa girare process-automation
-- ----------------------------------------------------------------------------
-- CONTESTO / BUG STORICO:
--   Il motore delle automazioni (process-automation, azione `process_queue`)
--   drena gli eventi dei trigger (automation_trigger_events) ed esegue la coda
--   con i ritardi (automation_queue). Per mesi NESSUN cron lo chiamava: 233
--   eventi erano fermi dal 29/03/2026, 0 arruolamenti, 0 email. Il motore era
--   spento a livello infrastrutturale.
--
-- FIX:
--   Schedula `process-automation` con action=process_queue ogni minuto. L'auth
--   usa il secret interno dal vault (`silvio_internal_cron_secret`), che è il
--   valore di INTERNAL_CRON_SECRET atteso da isInternalRequest() — NON il secret
--   '86c81d4…' usato da altri cron (quello vale per check-scheduled-triggers, che
--   ha un meccanismo di auth proprio).
--
-- SICUREZZA:
--   Con 0 flussi `published` il drain non arruola nessuno e non invia email.
--   Gli invii partono solo quando un flusso viene pubblicato.
--
-- IDEMPOTENTE: cron.schedule(jobname, …) fa upsert per nome.
-- ============================================================================

SELECT cron.schedule(
  'process-automation-queue',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/process-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
    ),
    body := '{"action":"process_queue"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
