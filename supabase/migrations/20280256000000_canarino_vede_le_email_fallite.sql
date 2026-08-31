-- Il canarino sorvegliava cron, HTTP, OAuth, dunning, ricariche, integrazioni e
-- numeri WhatsApp bannati — ma NON gli invii email falliti.
--
-- Costo reale del buco: le notifiche "nuovo lead" del CRM di piattaforma sono
-- fallite 18 volte su 18 dal 29 luglio al 29 agosto, sempre con lo stesso
-- errore di Elastic Email ('From email address: "no-reply@mkt.ediliziaincloud.com"
-- not allowed.'), e nessuno se n'e' accorto per un mese: i lead arrivavano in
-- pipeline in silenzio. Nello stesso periodo l'intero stream marketing ha
-- smesso di consegnare (ultimo invio riuscito 15 agosto) senza un solo segnale.
--
-- Si aggiungono due vitali:
--
--   email_fallite_24h  — il rumore di fondo: cosa sta rimbalzando adesso,
--                        raggruppato per stream ed errore.
--   email_stream_fermo — il segnale che mancava: uno stream che accumula
--                        fallimenti e non ha piu' UN SOLO invio riuscito. E'
--                        la firma della morte silenziosa, quella che i
--                        contatori giornalieri non vedono perche' il volume
--                        e' basso e un giorno a zero sembra normale.
--
-- Nient'altro cambia: gli altri vitali sono riportati identici.
CREATE OR REPLACE FUNCTION public.canarino_vitali()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'net'
AS $function$
WITH job_recenti AS (
  SELECT DISTINCT jobid FROM cron.job_run_details WHERE start_time > now() - interval '26 hours'
),
caselle AS (
  SELECT c.provider, count(*) AS totali,
    count(*) FILTER (WHERE (c.expires_at IS NOT NULL AND c.expires_at < now()) OR c.consecutive_errors >= 5) AS rotte
  FROM public.email_oauth_connections c WHERE c.poll_enabled GROUP BY c.provider
),
-- Per ogni stream: ultimo invio riuscito e quanti fallimenti sono arrivati DOPO.
email_stream AS (
  SELECT
    l.stream,
    max(l.sent_at) FILTER (WHERE l.status = 'sent')   AS ultima_riuscita,
    max(l.sent_at) FILTER (WHERE l.status = 'failed') AS ultima_fallita,
    count(*) FILTER (
      WHERE l.status = 'failed'
        AND l.sent_at > COALESCE(
              (SELECT max(l2.sent_at) FROM public.email_delivery_log l2
                WHERE l2.stream = l.stream AND l2.status = 'sent'),
              '-infinity'::timestamptz)
    ) AS fallite_dopo_ultima_riuscita
  FROM public.email_delivery_log l
  WHERE l.sent_at > now() - interval '45 days'
  GROUP BY l.stream
)
SELECT jsonb_build_object(
  'generato_alle', now(),
  'cron_silenti', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule))
    FROM cron.job j WHERE j.active
      AND split_part(j.schedule,' ',3)='*' AND split_part(j.schedule,' ',5)='*'
      AND j.jobid NOT IN (SELECT jobid FROM job_recenti)
      AND EXISTS (SELECT 1 FROM public.ops_cron_visti v WHERE v.jobid=j.jobid AND v.primo_avvistamento < now() - interval '26 hours')
  ), '[]'::jsonb),
  'http_errori_24h', COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT coalesce(r.status_code::text,'timeout') AS status, count(*) AS n, left(max(r.content),90) AS esempio
      FROM net._http_response r WHERE r.created > now() - interval '24 hours'
        AND (r.status_code IS NULL OR r.status_code >= 400)
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) x
  ), '[]'::jsonb),
  -- NUOVO: email respinte nelle ultime 24h, per stream ed errore.
  'email_fallite_24h', COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT l.stream,
             count(*) AS n,
             left(coalesce(l.error_message,'(senza dettaglio)'), 120) AS errore,
             max(l.template_type) AS esempio_template
      FROM public.email_delivery_log l
      WHERE l.sent_at > now() - interval '24 hours' AND l.status = 'failed'
      GROUP BY l.stream, left(coalesce(l.error_message,'(senza dettaglio)'), 120)
      ORDER BY count(*) DESC LIMIT 8) x
  ), '[]'::jsonb),
  -- NUOVO: stream che non consegna piu'. Se ci sono fallimenti dopo l'ultimo
  -- invio riuscito e l'ultimo successo e' vecchio di piu' di 2 giorni, quel
  -- canale e' morto e va detto.
  'email_stream_fermo', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'stream', s.stream,
      'ultima_riuscita', s.ultima_riuscita,
      'ferma_da_giorni', CASE WHEN s.ultima_riuscita IS NULL THEN NULL
                              ELSE (CURRENT_DATE - s.ultima_riuscita::date) END,
      'fallite_da_allora', s.fallite_dopo_ultima_riuscita))
    FROM email_stream s
    WHERE s.fallite_dopo_ultima_riuscita > 0
      AND (s.ultima_riuscita IS NULL OR s.ultima_riuscita < now() - interval '2 days')
  ), '[]'::jsonb),
  'whatsapp_numeri_bannati', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'numero', n.numero, 'dal', n.ban_rilevato_at::date,
      'nota', 'le campagne in corso sono state messe in pausa'))
    FROM public.openwa_numbers n WHERE n.stato = 'banned'
  ), '[]'::jsonb),
  'oauth_provider_giu', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('provider', k.provider, 'caselle_rotte', k.rotte, 'su_totale', k.totali,
      'sospetto', 'tutte le caselle ' || k.provider || ' sono giu'': controllare le credenziali OAuth di piattaforma'))
    FROM caselle k WHERE k.totali >= 3 AND k.rotte = k.totali
  ), '[]'::jsonb),
  'caselle_scollegate_totale', COALESCE((SELECT sum(k.rotte) FROM caselle k), 0),
  'caselle_collegate_totale', COALESCE((SELECT sum(k.totali) FROM caselle k), 0),
  'integrazioni_scadute', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('integration_id', ic.integration_id, 'tipo', ic.token_type, 'scaduta_il', ic.expires_at::date))
    FROM integration_credentials ic WHERE ic.expires_at IS NOT NULL AND ic.expires_at < now()
  ), '[]'::jsonb),
  'dunning_fermo', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('azienda', c.name, 'in_ritardo_da', (CURRENT_DATE - c.dunning_started_at::date)))
    FROM companies c WHERE c.stripe_subscription_status='past_due' AND c.dunning_started_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM dunning_attempts da WHERE da.company_id=c.id AND da.status='sent' AND da.created_at > now() - interval '4 days')
  ), '[]'::jsonb),
  'ricariche_esaurite', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('azienda', c.name, 'wallet', t.wallet_type, 'motivo', left(coalesce(t.last_failure_reason,'?'),60)))
    FROM company_auto_topup t JOIN companies c ON c.id=t.company_id WHERE t.retries_exhausted_at IS NOT NULL
  ), '[]'::jsonb)
);
$function$;
