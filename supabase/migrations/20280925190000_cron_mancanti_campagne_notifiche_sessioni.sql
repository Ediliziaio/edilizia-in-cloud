-- Cron che mancavano (25/09/2026): vincitore delle campagne A/B, reinvio a
-- chi non ha aperto, notifiche WhatsApp automatiche, pulizia delle sessioni.
--
-- Tutte e quattro le cose si configurano nell'app, ma non erano mai partite:
-- nessun cron le chiamava (trovate con la pulizia del codice morto del 25/09).
--
--  · A/B: la vecchia funzione contava gli stati 'opened'/'clicked', che nessuno
--    scrive (le aperture sono solo in opened_at/clicked_at, vedi
--    20280924213000): avrebbe dato sempre vincente la A. Qui si conta dagli
--    orari, dentro il database, senza passare da pg_net.
--  · Reinvio: la pagina promette «Invia nuovamente dopo 48h a chi non ha
--    aperto». La copia diventa una campagna normale, pianificata subito, con
--    reinvio_di = originale: la spedisce process-scheduled-campaigns →
--    send-email-campaign, che scala i crediti, rispetta disiscrizioni e
--    soppressioni e traccia le aperture (la vecchia funzione mandava gratis e
--    solo ai primi 50). Una sola copia per campagna, dentro 7 giorni.
--  · Sessioni: via quelle ferme da oltre 90 giorni, ma mai l'ultima di un
--    utente: da lì il pannello admin legge «ultima attività».
--  · Notifiche WhatsApp: check-wa-notifiche ogni 15 minuti (corretta nello
--    stesso commit). Gli eventi in coda più vecchi di 3 giorni si chiudono
--    senza inviare: chi accende una notifica non deve ricevere quelle di luglio.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. La copia di reinvio sa di chi è la copia ─────────────────────────
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS reinvio_di uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.email_campaigns.reinvio_di IS
  'Campagna originale di cui questa è il reinvio a chi non ha aperto: i destinatari vengono da email_destinatari_reinvio(reinvio_di).';
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_campaigns_reinvio_di
  ON public.email_campaigns (reinvio_di) WHERE reinvio_di IS NOT NULL;

-- ── 2. Chi ha ricevuto la campagna e non l'ha aperta ────────────────────
-- Stesse regole di send-email-campaign (iscritto, email presente, niente
-- optout), in più: nessuna apertura, clic, disiscrizione, rimbalzo o reclamo.
CREATE OR REPLACE FUNCTION public.email_destinatari_reinvio(p_campagna uuid)
 RETURNS TABLE (id uuid, email text, first_name text, last_name text, phone text,
                city text, province text, company_name text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT mc.id, mc.email, mc.first_name, mc.last_name, mc.phone, mc.city, mc.province, mc.company_name
    FROM (SELECT DISTINCT l.contact_id
            FROM public.email_logs l
           WHERE l.campaign_id = p_campagna AND l.status = 'delivered') d
    JOIN public.email_campaigns c ON c.id = p_campagna
    JOIN public.marketing_contacts mc ON mc.id = d.contact_id AND mc.company_id = c.company_id
   WHERE mc.unsubscribed = false
     AND mc.optout_email IS NOT TRUE
     AND mc.email IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.email_logs x
            WHERE x.campaign_id = p_campagna AND x.contact_id = mc.id
              AND (x.opened_at IS NOT NULL OR x.clicked_at IS NOT NULL
                   OR x.unsubscribed_at IS NOT NULL OR x.bounced_at IS NOT NULL
                   OR x.complaint_at IS NOT NULL))
   ORDER BY mc.id;
$function$;
REVOKE ALL ON FUNCTION public.email_destinatari_reinvio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_destinatari_reinvio(uuid) TO service_role;

-- ── 3. Preparare i reinvii: 48 ore dopo, una volta, come campagna normale ─
CREATE OR REPLACE FUNCTION public.email_prepara_reinvii()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_b boolean;
  v_creati integer := 0;
BEGIN
  FOR c IN
    SELECT o.*
      FROM public.email_campaigns o
     WHERE o.resend_to_unopened
       AND o.status = 'sent'
       AND o.reinvio_di IS NULL
       AND o.completed_at <= now() - interval '48 hours'
       AND o.completed_at > now() - interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM public.email_campaigns r WHERE r.reinvio_di = o.id)
     ORDER BY o.completed_at
     LIMIT 20
  LOOP
    -- Nessuno da raggiungere: niente copia vuota.
    IF NOT EXISTS (SELECT 1 FROM public.email_destinatari_reinvio(c.id)) THEN
      CONTINUE;
    END IF;
    -- In un A/B si rimanda la variante che ha vinto.
    v_b := c.ab_test_enabled AND c.ab_winner = 'B';
    -- recipient_filter con un'etichetta che nessun contatto ha: se un giorno la
    -- copia arrivasse a un invio che non conosce reinvio_di, partirebbe verso
    -- nessuno invece che verso tutta la lista dell'azienda.
    INSERT INTO public.email_campaigns (
      company_id, name, subject, template_id, status, type, scheduled_at, created_by,
      folder_id, html_content, sender_name, sender_email, preview_text, track_clicks,
      utm_tracking, auto_tag, resend_to_unopened, send_mode, json_content, reinvio_di,
      recipient_filter, segment_json
    ) VALUES (
      c.company_id,
      c.name || ' — reinvio a chi non ha aperto',
      'Hai perso questa email? ' || CASE WHEN v_b AND nullif(btrim(c.ab_subject_b), '') IS NOT NULL
                                         THEN c.ab_subject_b ELSE c.subject END,
      c.template_id, 'scheduled', c.type, now(), c.created_by, c.folder_id,
      CASE WHEN v_b AND nullif(btrim(c.ab_html_content_b), '') IS NOT NULL
           THEN c.ab_html_content_b ELSE c.html_content END,
      c.sender_name, c.sender_email, c.preview_text, c.track_clicks,
      c.utm_tracking, c.auto_tag, false, 'immediate', c.json_content, c.id,
      jsonb_build_object('tags', jsonb_build_array('__solo_reinvio_non_aperti__')), NULL
    )
    ON CONFLICT (reinvio_di) WHERE reinvio_di IS NOT NULL DO NOTHING;
    IF FOUND THEN
      v_creati := v_creati + 1;
    END IF;
  END LOOP;
  RETURN v_creati;
END;
$function$;
REVOKE ALL ON FUNCTION public.email_prepara_reinvii() FROM PUBLIC, anon, authenticated;

-- ── 4. Vincitore A/B, dagli orari di apertura e clic ────────────────────
CREATE OR REPLACE FUNCTION public.email_ab_scegli_vincitori()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scelti integer;
BEGIN
  WITH pronte AS (
    SELECT c.id, coalesce(c.ab_winner_criteria, 'open_rate') AS criterio
      FROM public.email_campaigns c
     WHERE c.ab_test_enabled
       AND c.status = 'sent'
       AND c.ab_winner IS NULL
       AND coalesce(c.completed_at, c.sent_at) IS NOT NULL
       AND coalesce(c.completed_at, c.sent_at)
             + make_interval(hours => coalesce(c.ab_test_duration_hours, 4)) <= now()
  ), per_variante AS (
    SELECT p.id, p.criterio, l.ab_variant,
           count(*)::numeric AS inviate,
           count(*) FILTER (WHERE l.opened_at IS NOT NULL OR l.clicked_at IS NOT NULL)::numeric AS aperte,
           count(*) FILTER (WHERE l.clicked_at IS NOT NULL)::numeric AS cliccate
      FROM pronte p
      JOIN public.email_logs l ON l.campaign_id = p.id AND l.ab_variant IN ('A', 'B')
     WHERE l.status <> 'failed'
     GROUP BY p.id, p.criterio, l.ab_variant
  ), tassi AS (
    SELECT id,
           max(CASE WHEN ab_variant = 'A' THEN
                 (CASE WHEN criterio = 'click_rate' THEN cliccate ELSE aperte END) / nullif(inviate, 0) END) AS a,
           max(CASE WHEN ab_variant = 'B' THEN
                 (CASE WHEN criterio = 'click_rate' THEN cliccate ELSE aperte END) / nullif(inviate, 0) END) AS b
      FROM per_variante
     GROUP BY id
  )
  UPDATE public.email_campaigns c
     SET ab_winner = CASE WHEN coalesce(t.b, 0) > coalesce(t.a, 0) THEN 'B' ELSE 'A' END
    FROM tassi t
   WHERE c.id = t.id AND c.ab_winner IS NULL;
  GET DIAGNOSTICS v_scelti = ROW_COUNT;
  RETURN v_scelti;
END;
$function$;
REVOKE ALL ON FUNCTION public.email_ab_scegli_vincitori() FROM PUBLIC, anon, authenticated;

-- ── 5. Sessioni: via le vecchie, mai l'ultima di un utente ──────────────
CREATE OR REPLACE FUNCTION public.pulisci_sessioni_utente()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tolte integer;
BEGIN
  DELETE FROM public.user_sessions s
   WHERE s.last_active_at < now() - interval '90 days'
     AND EXISTS (SELECT 1 FROM public.user_sessions n
                  WHERE n.user_id = s.user_id AND n.last_active_at > s.last_active_at);
  GET DIAGNOSTICS v_tolte = ROW_COUNT;
  RETURN v_tolte;
END;
$function$;
REVOKE ALL ON FUNCTION public.pulisci_sessioni_utente() FROM PUBLIC, anon, authenticated;

-- ── 6. Notifiche WhatsApp: gli eventi vecchi non partono ────────────────
UPDATE public.wa_notifiche_event_queue
   SET processed = true, processed_at = now()
 WHERE processed IS NOT TRUE
   AND created_at < now() - interval '3 days';

-- ── 7. I cron (mai al minuto 0) ─────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('email-ab-vincitori', 'email-reinvii-non-aperti',
                     'sessioni-utente-pulizia', 'check-wa-notifiche');
END $$;

SELECT cron.schedule('email-ab-vincitori', '17 * * * *',
  $cron$SELECT public.email_ab_scegli_vincitori()$cron$);

SELECT cron.schedule('email-reinvii-non-aperti', '23,53 * * * *',
  $cron$SELECT public.email_prepara_reinvii()$cron$);

SELECT cron.schedule('sessioni-utente-pulizia', '47 3 * * *',
  $cron$SELECT public.pulisci_sessioni_utente()$cron$);

SELECT cron.schedule('check-wa-notifiche', '7-59/15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/check-wa-notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
$cron$);
