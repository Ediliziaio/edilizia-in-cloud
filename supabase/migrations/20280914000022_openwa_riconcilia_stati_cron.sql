-- I numeri WhatsApp risultavano «in attesa di QR» mentre il gateway li dava
-- connessi: lo stato viveva solo sugli eventi push, e un evento con lo stato
-- annidato in `data` (come li manda questo gateway) veniva letto vuoto e
-- degradava il numero. Risultato: campagne ferme dalla mezzanotte, nessun
-- avviso, perché nessuno stava cadendo davvero.
--
-- Oltre al fix nel webhook, questa è la rete di sicurezza: ogni 10 minuti si
-- chiede al gateway lo stato vero di tutte le sessioni e si riallinea. Un
-- evento perso non può più fermare gli invii per una notte intera.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'openwa-riconcilia-stati') THEN
    PERFORM cron.unschedule('openwa-riconcilia-stati');
  END IF;
  PERFORM cron.schedule(
    'openwa-riconcilia-stati',
    '*/10 * * * *',
    $cmd$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/openwa-riconcilia-stati',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                          WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cmd$
  );
END $$;
