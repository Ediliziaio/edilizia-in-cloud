-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · STEP 3 (parte 1) — ACCENDI il pipeline email-AI dormiente
-- ────────────────────────────────────────────────────────────────────────────
-- Le funzioni email-ai-* erano deployate ma MAI schedulate (girava solo il
-- poller). Accendiamo i due layer a costo nullo/irrisorio:
--   - email-ai-l1-classify (backfill): classificazione DETERMINISTICA, costo AI = 0.
--   - email-ai-embed-backfill: embedding text-embedding-3-small (~$0.05 per i 1.366
--     storici, poi centesimi/mese) → abilita la ricerca semantica.
-- Stesso pattern di email-poll-inbox (net.http_post + current_setting app.*).
-- L3 (Haiku) ed estrazione (DDT/opportunità/scadenze) verranno accesi DOPO la
-- verifica, perché hanno un costo AI (anche se piccolo).
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('email-ai-l1-classify-2min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('email-ai-embed-2min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    PERFORM cron.schedule(
      'email-ai-l1-classify-2min',
      '*/2 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/email-ai-l1-classify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body := '{"mode":"backfill","limit":200}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;
      $cron$
    );

    PERFORM cron.schedule(
      'email-ai-embed-2min',
      '*/2 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/email-ai-embed-backfill',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body := '{"limit":50}'::jsonb,
        timeout_milliseconds := 120000
      ) AS request_id;
      $cron$
    );

  END IF;
END $$;
