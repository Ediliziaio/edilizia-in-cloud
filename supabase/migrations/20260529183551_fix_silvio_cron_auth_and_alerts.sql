-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.silvio_invoke_edge(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_url text;
  v_cron_secret text;
  v_bearer text;
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
    EXCEPTION WHEN OTHERS THEN v_cron_secret := NULL; END;
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
    EXCEPTION WHEN OTHERS THEN v_bearer := NULL; END;
  END IF;
  v_bearer := COALESCE(NULLIF(v_bearer, ''), v_cron_secret);
  v_request_id := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer,
      'x-internal-cron-secret', v_cron_secret
    ),
    body := p_body
  );
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] error invoking %: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_detect_alerts_all_companies()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_company_id uuid;
  v_total int := 0;
  v_failed int := 0;
  v_cashflow_alerts int := 0;
BEGIN
  FOR v_company_id IN
    SELECT id FROM public.companies
    WHERE status IN ('active', 'trial')
  LOOP
    BEGIN
      PERFORM public.silvio_detect_alerts(v_company_id);
      v_cashflow_alerts := v_cashflow_alerts + COALESCE(public.silvio_detect_cashflow_alerts(v_company_id), 0);
      v_total := v_total + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING '[silvio detect cron] company % failed: %', v_company_id, SQLERRM;
    END;
  END LOOP;
  PERFORM public.silvio_expire_alerts();
  RETURN jsonb_build_object(
    'success', true, 'companies_processed', v_total,
    'failures', v_failed, 'cashflow_alerts_created', v_cashflow_alerts
  );
END;
$function$;
