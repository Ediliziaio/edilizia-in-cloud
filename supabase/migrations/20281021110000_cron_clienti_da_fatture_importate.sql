-- ════════════════════════════════════════════════════════════════════════════
-- Cron: gli intestatari delle fatture importate entrano nei Clienti
-- ════════════════════════════════════════════════════════════════════════════
-- clienti-da-fatture-importate (pubblicata prima di questa migrazione) guarda
-- 40 fatture a giro, le più recenti prima. Risponde a pg_net entro 5 secondi e
-- finisce in background, quindi l'attesa resta a 15 secondi (CLAUDE.md, «la
-- coda è una sola»). Segreto dal Vault, mai in chiaro. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM cron.unschedule('clienti-da-fatture-importate')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clienti-da-fatture-importate');
  PERFORM cron.schedule('clienti-da-fatture-importate', '3-59/5 * * * *', $cmd$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/clienti-da-fatture-importate',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')),
    body := '{"source":"pg_cron","limite":40}'::jsonb,
    timeout_milliseconds := 15000
  );$cmd$);
END $$;
