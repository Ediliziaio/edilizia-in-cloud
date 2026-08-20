-- I preventivi scaduti diventano "scaduta" da soli, una volta al giorno.
--
-- Prima la transizione avveniva solo se il CLIENTE riapriva il link di firma
-- oltre la data (quote-sign): un preventivo mai riaperto restava "inviata"
-- per sempre, gonfiando pipeline e KPI. Questo job e' un UPDATE puro:
-- niente net.http_post, niente parametri app.* (che su Supabase non si
-- possono impostare) — solo SQL con valori letterali, immune ai guasti
-- silenziosi dei cron che chiamano funzioni edge.

SELECT cron.unschedule('quotes-marca-scadute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quotes-marca-scadute');

SELECT cron.schedule(
  'quotes-marca-scadute',
  '15 4 * * *',
  $$
    UPDATE public.quotes
       SET status = 'scaduta'
     WHERE status = 'inviata'
       AND expires_at IS NOT NULL
       AND expires_at < now()
       AND deleted_at IS NULL;
  $$
);
