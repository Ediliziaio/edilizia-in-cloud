-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · #1 Osservabilità — health check piattaforma (cron falliti)
-- ────────────────────────────────────────────────────────────────────────────
-- Buco #1 emerso durante l'audit: feature/cron che falliscono in SILENZIO
-- (es. 5 cron rotti per current_setting('app.supabase_url')=NULL). Questa RPC
-- legge cron.job_run_details e restituisce i job falliti nelle ultime 2h +
-- l'ultimo errore, così Silvio (super admin) può rispondere a "ci sono problemi
-- tecnici?" e il team se ne accorge SUBITO invece che per caso.
-- Read-only. Esposta dal tool Silvio "stato_sistema" (solo super_admin).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_ops_health(p_company_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $fn$
DECLARE v_fail jsonb; v_active int;
BEGIN
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'fallite')::int DESC), '[]'::jsonb) INTO v_fail FROM (
    SELECT jsonb_build_object('job', j.jobname, 'fallite', count(*),
             'ultimo_errore', left(max(d.return_message) FILTER (WHERE d.status <> 'succeeded'), 180)) AS x
    FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now() - interval '2 hours' AND d.status <> 'succeeded'
    GROUP BY j.jobname
  ) t;
  SELECT count(*) INTO v_active FROM cron.job WHERE active;
  RETURN jsonb_build_object('cron_falliti_2h', v_fail, 'cron_attivi_totali', v_active, 'verificato_al', now());
END $fn$;
REVOKE EXECUTE ON FUNCTION public.silvio_ops_health(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_ops_health(uuid, uuid) TO authenticated, service_role;
