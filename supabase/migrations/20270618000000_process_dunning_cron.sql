-- ============================================================================
-- process_dunning_cron — schedula il runner di sollecito/sospensione abbonamenti.
--
-- Senza questo cron la funzione process-dunning non viene mai eseguita in
-- automatico, quindi la policy "mancato pagamento → email di sollecito (giorno
-- 3 e 7) → sospensione a 7 giorni → annullamento" resta inattiva.
--
-- Esecuzione: una volta al giorno alle 02:30 UTC (orario off-peak), come gli
-- altri job notturni. process-dunning è idempotente per giorno: invia ciascun
-- sollecito una sola volta (guardia su dunning_status / payment_failure_count).
--
-- Auth: stesso schema di bulk_scheduler_cron — header x-cron-secret valorizzato
-- col secret di vault 'silvio_internal_cron_secret' (deve coincidere con la env
-- INTERNAL_CRON_SECRET letta da process-dunning).
-- ============================================================================

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-dunning-daily';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-dunning-daily',
    '30 2 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/process-dunning',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END
$$;
