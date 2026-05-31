-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · STEP 3 (parte 2) — L3 batch (Haiku) per completare la classificazione
-- ────────────────────────────────────────────────────────────────────────────
-- L1 (deterministico, costo 0) classifica ~60%. Le "miss" vanno a L3, che usa
-- claude-haiku-4-5 (prompt cache) — costo AI piccolo. Cron */3, limit 30.
-- Testato one-shot: 18/18 classificate, 0 da_rivedere, 200 OK.
-- NB: in prod il job usa url+secret hardcoded (come gli altri cron email);
-- qui current_setting è la forma "documentale" coerente col repo.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('email-ai-l3-batch-3min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'email-ai-l3-batch-3min',
      '*/3 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/email-ai-l3-batch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body := '{"mode":"live","limit":30}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;
