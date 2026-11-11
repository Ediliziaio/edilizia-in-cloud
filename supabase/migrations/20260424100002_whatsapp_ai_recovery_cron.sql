-- =============================================================================
-- P1-1 — Schedule cron whatsapp-ai-recovery ogni 5 minuti
-- =============================================================================
-- Pattern allineato agli altri cron del repo (retry-failed-webhooks,
-- send-nps-survey, check-ai-usage-alerts): usa
--   - current_setting('app.supabase_url', true)
--   - (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
-- che sono i GUC settati a livello DB tramite ALTER DATABASE SET.
--
-- Idempotente: unschedule prima se il job esiste già.
-- =============================================================================

-- Rimuovi la schedulazione precedente se esiste (previene duplicati su re-apply).
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-ai-recovery');
EXCEPTION WHEN OTHERS THEN
  -- Job non schedulato in precedenza: ok, andiamo avanti.
  NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-ai-recovery',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/whatsapp-ai-recovery',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body    := '{}'::jsonb
    );
  $$
);
