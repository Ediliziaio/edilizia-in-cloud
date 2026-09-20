-- Gli esiti dello SDI adesso si vanno a prendere (audit 20/09/2026).
--
-- invia-sdi metteva la fattura in «attesa esito» (sdi_stato = 'AT') e da lì non
-- si muoveva più: a openapi.it non veniva registrato nessun indirizzo di
-- richiamo, nessun lavoro periodico andava a chiedere com'era finita, e il
-- webhook che c'era cercava il documento con `sdi_id_trasmissione` — che
-- contiene l'identificativo interno del provider — mentre la notifica porta
-- l'IdentificativoSdI, che è un altro numero. Al 20/09/2026 sdi_log e
-- sdi_provider_responses erano vuoti: nessuna ricevuta di consegna, nessuno
-- scarto, mai. Una fattura scartata restava «inviata» e nessuno lo sapeva.
--
-- Due cose qui:
--   1. la colonna dove tenere l'IdentificativoSdI quando il provider lo dà, così
--      il webhook riesce a riconoscere il documento;
--   2. il lavoro che ogni quarto d'ora chiede a openapi lo stato delle fatture
--      ancora senza esito definitivo (edge function sdi-stato-tick).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS sdi_identificativo text;

COMMENT ON COLUMN public.documenti_fiscali.sdi_identificativo IS
  'IdentificativoSdI assegnato dallo SDI, quando il provider lo restituisce. Diverso da sdi_id_trasmissione, che è l''id interno del provider. È il numero con cui arrivano le notifiche.';

CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_sdi_identificativo
  ON public.documenti_fiscali (sdi_identificativo)
  WHERE sdi_identificativo IS NOT NULL;

-- Un quarto d'ora è il passo giusto: lo SDI risponde in genere entro pochi
-- minuti per lo scarto e fino a cinque giorni per la consegna, e la funzione
-- guarda solo i documenti ancora aperti (quaranta per giro).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sdi-stato-quarto-dora';
SELECT cron.schedule(
  'sdi-stato-quarto-dora',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/sdi-stato-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret')
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
