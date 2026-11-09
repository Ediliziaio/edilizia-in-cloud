-- Ogni 10 minuti le pagine del giornale seguono i rapportini. Si accende dopo il deploy della funzione: una versione vecchia, col modo «coda», farebbe il giro serale.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'giornale-aggiorna-dai-rapportini') then
    perform cron.unschedule('giornale-aggiorna-dai-rapportini');
  end if;
  perform cron.schedule('giornale-aggiorna-dai-rapportini', '*/10 * * * *', $job$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/auto-genera-giornale-cantiere',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
      body := '{"modo":"coda"}'::jsonb,
      timeout_milliseconds := 15000);
  $job$);
end $$;
