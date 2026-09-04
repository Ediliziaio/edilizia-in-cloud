-- F0-03 — Purge notturno delle aziende cancellate da oltre 30 giorni.
SELECT cron.schedule('purge-aziende-cancellate-30gg', '50 3 * * *',
  $$SELECT public.purge_deleted_companies()$$);

-- F2-06 — Gli avvisi di ciclo di vita (trial in scadenza, crediti bassi,
-- fatture scadute) esistevano già in `platform-lifecycle-cron`, ma la funzione
-- non era mai stata pianificata: non è mai partita.
SELECT cron.schedule('platform-lifecycle-avvisi', '15 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/platform-lifecycle-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
    body := '{"trial_days": 7}'::jsonb,
    timeout_milliseconds := 12000
  );
  $$);
