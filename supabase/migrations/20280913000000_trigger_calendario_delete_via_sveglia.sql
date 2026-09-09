-- 09/09/2026 — Il trigger che toglie l'evento dal calendario esterno quando un
-- appuntamento viene cancellato o annullato non ha mai funzionato: cercava la
-- service key nel Vault (dove non c'è mai stata) e in una GUC (mai impostata),
-- e usciva in silenzio con un WARNING. Ora passa dal segreto interno dei cron,
-- come già fanno le pose (google_calendar_sveglia), e avvisa anche Apple.
-- Applicata sul live via Management API, poi migration repair 20280913000000.

CREATE OR REPLACE FUNCTION public.calendario_esterno_sveglia(p_funzione text, p_action text, p_body jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_secret text;
BEGIN
  IF p_funzione NOT IN ('google-calendar-sync', 'apple-calendar-sync') THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
   WHERE name = 'silvio_internal_cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_funzione,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', p_action) || coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 8000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'calendario_esterno_sveglia: %', SQLERRM;
END
$$;
REVOKE ALL ON FUNCTION public.calendario_esterno_sveglia(text, text, jsonb) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.notify_google_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  _company_id uuid;
  _appointment_id uuid;
  _google google_calendar_event_map%ROWTYPE;
  _apple apple_calendar_event_map%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _company_id := OLD.company_id;
    _appointment_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('annullato', 'cancelled')
        AND OLD.status NOT IN ('annullato', 'cancelled') THEN
    _company_id := NEW.company_id;
    _appointment_id := NEW.id;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Le mappe si leggono ADESSO: sul DELETE il cascade le porta via subito dopo,
  -- e l'edge arriva quando non ci sono più. Per questo le passiamo per intero.
  SELECT * INTO _google FROM google_calendar_event_map WHERE appointment_id = _appointment_id LIMIT 1;
  IF _google.id IS NOT NULL THEN
    PERFORM public.calendario_esterno_sveglia('google-calendar-sync', 'delete-event', jsonb_build_object(
      'appointmentId', _appointment_id,
      'companyId', _company_id,
      'userId', _google.user_id,
      'googleEventId', _google.google_event_id,
      'googleCalendarId', _google.google_calendar_id
    ));
  END IF;

  SELECT * INTO _apple FROM apple_calendar_event_map WHERE appointment_id = _appointment_id LIMIT 1;
  IF _apple.id IS NOT NULL THEN
    PERFORM public.calendario_esterno_sveglia('apple-calendar-sync', 'delete-event', jsonb_build_object(
      'appointmentId', _appointment_id,
      'companyId', _company_id,
      'userId', _apple.user_id
    ));
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$$;
