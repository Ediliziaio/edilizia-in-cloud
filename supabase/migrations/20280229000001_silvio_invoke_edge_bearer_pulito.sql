-- silvio_invoke_edge: mai piu' un segreto al posto del JWT.
--
-- Quando nel vault manca 'service_role_key', il fallback metteva il CRON
-- SECRET dentro Authorization: Bearer — che non e' un JWT: sulle funzioni con
-- verify_jwt il gateway rispondeva UNAUTHORIZED_INVALID_JWT_FORMAT (25 volte
-- negli ultimi 7 giorni). L'autenticazione vera di queste chiamate e' l'header
-- x-internal-cron-secret: se una chiave da mettere nel Bearer non c'e',
-- l'header Authorization semplicemente non si manda.
--
-- (Il giorno in cui 'service_role_key' verra' caricata nel vault, il Bearer
-- torna ad essere la chiave vera e anche il trigger del calendario Google
-- smettera' di saltare le notifiche.)
CREATE OR REPLACE FUNCTION public.silvio_invoke_edge(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_cron_secret text;
  v_bearer text;
  v_headers jsonb;
  v_request_id bigint;
BEGIN
  v_url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_function_name;

  v_cron_secret := NULLIF(current_setting('app.settings.internal_cron_secret', true), '');
  IF v_cron_secret IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_cron_secret
      FROM vault.decrypted_secrets
      WHERE name IN ('silvio_internal_cron_secret', 'internal_cron_secret')
      ORDER BY (name = 'silvio_internal_cron_secret') DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_cron_secret := NULL;
    END;
  END IF;
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE WARNING '[silvio_invoke_edge] cron secret mancante (app.settings/vault) per %', p_function_name;
    RETURN NULL;
  END IF;

  v_bearer := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF v_bearer IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_bearer
      FROM vault.decrypted_secrets
      WHERE name IN ('service_role_key', 'supabase_service_role_key')
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_bearer := NULL;
    END;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-internal-cron-secret', v_cron_secret
  );
  -- Bearer SOLO se abbiamo una chiave vera: un segreto qualsiasi al suo posto
  -- non autentica niente e fa scattare il gateway.
  IF v_bearer IS NOT NULL AND v_bearer <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_bearer);
  END IF;

  v_request_id := net.http_post(url := v_url, headers := v_headers, body := p_body);
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] invocazione % fallita: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$function$;
