-- ════════════════════════════════════════════════════════════════════════════
-- AI Feature #1B — Auto-execute worker pg_cron schedule
-- ────────────────────────────────────────────────────────────────────────────
-- Schedula la edge function `ai-auto-execute-pending` ogni 15 minuti.
--
-- Il worker:
--   1. Seleziona proposte ai_action_proposals con status='pending' auto-generate
--   2. Per ognuna verifica la policy via get_ai_action_permission
--   3. Se mode='auto_execute' → invoca silvio-execute-action con bypass header
--   4. Altrimenti lascia la proposta in attesa di conferma utente
--
-- Sicurezza:
--   - Worker richiede secret PROACTIVE_CRON_SECRET nei header
--   - silvio-execute-action richiede INTERNAL_AUTO_EXECUTE_SECRET nei header
--   - Policy DB è source-of-truth: senza auto_execute esplicito niente parte
--
-- Idempotenza: cron.unschedule prima di schedule per re-deploy safe.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: rimuovi eventuale schedulazione precedente (safe se non esiste)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ai-auto-execute-pending');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 2: schedula ogni 15 minuti se pg_cron + pg_net disponibili
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'ai-auto-execute-pending',
      '*/15 * * * *', -- ogni 15 minuti
      $cron$
      SELECT net.http_post(
        url:=current_setting('app.supabase_url', true) || '/functions/v1/ai-auto-execute-pending',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body:='{"source": "pg_cron_15min"}'::jsonb,
        timeout_milliseconds:=120000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;

COMMIT;
