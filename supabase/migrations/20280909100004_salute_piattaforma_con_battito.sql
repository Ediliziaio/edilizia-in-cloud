-- Una sonda che nessuno guarda è rumore. Il battito entra nella pagina "Salute
-- piattaforma", accanto ai job e alle edge function: è lì che si va a vedere se
-- qualcosa non va, e finora quella pagina non poteva dire la cosa più
-- importante, cioè se la piattaforma risponde da fuori.

CREATE OR REPLACE FUNCTION public.admin_platform_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron' AS $function$
DECLARE v_job jsonb; v_falliti jsonb; v_funzioni jsonb; v_riepilogo jsonb; v_battito jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.falliti DESC, t.job), '[]'::jsonb) INTO v_job
  FROM (SELECT j.jobname AS job, j.schedule, j.active AS attivo,
               count(d.*) AS esecuzioni,
               count(*) FILTER (WHERE d.status <> 'succeeded') AS falliti,
               max(d.start_time) AS ultima,
               max(d.return_message) FILTER (WHERE d.status <> 'succeeded') AS ultimo_errore
          FROM cron.job j
          LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid AND d.start_time > now() - interval '24 hours'
         GROUP BY j.jobname, j.schedule, j.active) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.falliti DESC), '[]'::jsonb) INTO v_falliti
  FROM (SELECT j.jobname AS job, count(*) FILTER (WHERE d.status <> 'succeeded') AS falliti,
               count(*) AS esecuzioni,
               max(d.return_message) FILTER (WHERE d.status <> 'succeeded') AS errore,
               max(d.start_time) AS ultima
          FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
         WHERE d.start_time > now() - interval '48 hours'
         GROUP BY j.jobname
        HAVING count(*) FILTER (WHERE d.status <> 'succeeded') > 0) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.errori DESC, t.chiamate DESC), '[]'::jsonb) INTO v_funzioni
  FROM (SELECT function_name AS funzione, count(*) AS chiamate,
               count(*) FILTER (WHERE status_code >= 400) AS errori,
               round(avg(latency_ms)) AS latenza_media_ms, max(latency_ms) AS latenza_max_ms,
               max(recorded_at) AS ultima
          FROM public.system_health_metrics
         WHERE recorded_at > now() - interval '24 hours'
         GROUP BY function_name) t;

  -- Raggiungibilità dall'esterno, più le finestre di irraggiungibilità delle
  -- ultime 48 ore: un elenco vuoto è la risposta giusta.
  SELECT jsonb_build_object(
    'stato',       (SELECT to_jsonb(b) FROM public.v_battito_stato b),
    'interruzioni', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.inizio DESC) FROM (
        SELECT min(avviato_il) AS inizio, max(avviato_il) AS fine, count(*) AS controlli_falliti
          FROM (SELECT avviato_il, esito,
                       count(*) FILTER (WHERE esito = 'ok') OVER (ORDER BY avviato_il) AS blocco
                  FROM public.battito_esterno
                 WHERE avviato_il > now() - interval '48 hours' AND esito IS NOT NULL) s
         WHERE esito = 'fallito'
         GROUP BY blocco
      ) x), '[]'::jsonb)
  ) INTO v_battito;

  SELECT jsonb_build_object(
    'job_totali', (SELECT count(*) FROM cron.job),
    'job_attivi', (SELECT count(*) FROM cron.job WHERE active),
    'job_con_errori', jsonb_array_length(v_falliti),
    'funzioni_strumentate', (SELECT count(DISTINCT function_name) FROM public.system_health_metrics
                              WHERE recorded_at > now() - interval '7 days'),
    'funzioni_totali_stimate', 515,
    'errori_edge_24h', (SELECT count(*) FROM public.system_health_metrics
                         WHERE recorded_at > now() - interval '24 hours' AND status_code >= 400),
    'aziende_attive_24h', public.get_active_companies_count(24),
    'trial_scaduti_da_gestire', (SELECT count(*) FROM public.companies
                                  WHERE status = 'trial' AND trial_ends_at < now() AND deleted_at IS NULL),
    'insoluti_aperti', (SELECT count(*) FROM public.v_insoluti WHERE NOT COALESCE(in_omaggio, false)),
    'aziende_cancellate_in_attesa', (SELECT count(*) FROM public.companies WHERE deleted_at IS NOT NULL),
    'disponibilita_24h_pct', (SELECT disponibilita_24h_pct FROM public.v_battito_stato),
    'segreti_cron_in_chiaro', (SELECT count(*) FROM cron.job
                                WHERE command ~ 'cron-secret' AND command !~ 'decrypted_secret')
  ) INTO v_riepilogo;

  RETURN jsonb_build_object('riepilogo', v_riepilogo, 'job_falliti', v_falliti,
                            'job', v_job, 'funzioni', v_funzioni, 'battito', v_battito,
                            'calcolato_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.admin_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_health() TO authenticated, service_role;
