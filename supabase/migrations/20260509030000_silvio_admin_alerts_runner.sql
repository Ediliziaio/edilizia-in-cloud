-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO SUPERADMIN — Alert Runner (proattivo, cron 15min)
-- -----------------------------------------------------------------------
-- RPC silvio_admin_alerts_runner che popola silvio_admin_alerts con 5 regole:
--   1. payment_failed: pagamento fallito su subscription (critical)
--   2. demo_request_recent: nuovo demo request <30min (warning)
--   3. lead_silent_hot: lead score >80 non contattato da >48h (warning)
--   4. churn_warning: cliente paying con last_login >14gg (warning)
--   5. errors_5xx_spike: edge function failing rate spike (critical)
--
-- Schedulato via pg_cron ogni 15 minuti.
-- Dedup automatico: usa dedup_key, incrementa occurrences invece di duplicare.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Helper: upsert alert (dedup automatico)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_admin_alert_upsert(
  p_category    TEXT,
  p_severity    TEXT,
  p_title       TEXT,
  p_description TEXT,
  p_dedup_key   TEXT,
  p_related     JSONB DEFAULT NULL,
  p_suggested   TEXT DEFAULT NULL,
  p_expires_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_alert_id UUID;
BEGIN
  -- Cerca alert esistente con stesso dedup_key e status=open
  SELECT id INTO v_existing
  FROM public.silvio_admin_alerts
  WHERE dedup_key = p_dedup_key AND status = 'open'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Incrementa counter
    UPDATE public.silvio_admin_alerts
    SET occurrences = occurrences + 1,
        updated_at = now()
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  -- Insert nuovo
  INSERT INTO public.silvio_admin_alerts (
    category, severity, title, description, dedup_key,
    related_entity, suggested_action, expires_at
  ) VALUES (
    p_category, p_severity, p_title, p_description, p_dedup_key,
    p_related, p_suggested, p_expires_at
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_admin_alert_upsert(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Main runner — chiamato da pg_cron ogni 15 min
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_admin_alerts_runner()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts_created INT := 0;
  v_alerts_dedup   INT := 0;
  v_rec            RECORD;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────
  -- 1. PAYMENT FAILED — subscription past_due/unpaid recente
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT s.company_id, c.name AS company_name, s.id AS sub_id, s.status::text AS sub_status
      FROM public.subscriptions s
      LEFT JOIN public.companies c ON c.id = s.company_id
      WHERE s.status::text IN ('past_due', 'unpaid')
        AND s.updated_at >= now() - interval '24 hours'
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'revenue',
        'critical',
        '🚨 Pagamento fallito: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Subscription ' || v_rec.sub_status || ' — verificare carta cliente',
        'payment_failed:' || v_rec.sub_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name),
        'Manda email recovery + check carta scaduta'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- subscriptions table non disponibile, skip
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 2. DEMO REQUEST RECENT — nuovo lead source=demo_request <30min
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.email, mc.company_name, mc.source
      FROM public.marketing_contacts mc
      WHERE mc.created_at >= now() - interval '30 minutes'
        AND (mc.source ILIKE '%demo%' OR mc.contact_type = 'lead')
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '⚠️ Demo request: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email, 'Sconosciuto'),
        COALESCE(v_rec.company_name || ' — ', '') || 'arrivato negli ultimi 30 min via ' || COALESCE(v_rec.source, 'demo'),
        'demo_request:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'email', v_rec.email),
        'Contatta entro 1 ora — conversion rate scende del 60% dopo'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 3. LEAD SILENT HOT — lead score >80 e non contattato da >48h
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.company_name, mc.email,
             COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) AS score_eff,
             mc.last_activity_at
      FROM public.marketing_contacts mc
      WHERE COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) >= 80
        AND COALESCE(mc.last_activity_at, mc.created_at) <= now() - interval '48 hours'
        AND COALESCE(mc.last_activity_at, mc.created_at) >= now() - interval '14 days'  -- evita lead vecchissimi
        AND (mc.contact_type IS NULL OR mc.contact_type IN ('lead','prospect'))
      LIMIT 50
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '🔥 Lead caldo silente: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email),
        'Score ' || v_rec.score_eff || ' · non contattato da ' ||
        ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(v_rec.last_activity_at, now()))) / 86400) || ' giorni',
        'lead_silent_hot:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'score', v_rec.score_eff),
        'Manda follow-up oggi — score sta degradando'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 4. CHURN WARNING — cliente paying che non si logga da >14gg
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        c.id AS company_id,
        c.name AS company_name,
        MAX(u.last_sign_in_at) AS last_login,
        EXTRACT(EPOCH FROM (now() - MAX(u.last_sign_in_at))) / 86400 AS days_silent
      FROM public.companies c
      JOIN public.profiles p ON p.company_id = c.id
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.subscriptions s ON s.company_id = c.id AND s.status::text = 'active'
      WHERE c.is_platform_admin_company = false
        AND s.id IS NOT NULL  -- è paying
      GROUP BY c.id, c.name
      HAVING MAX(u.last_sign_in_at) <= now() - interval '14 days'
         AND MAX(u.last_sign_in_at) IS NOT NULL
      LIMIT 30
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'churn',
        'warning',
        '⚠️ Churn risk: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Nessun login da ' || ROUND(v_rec.days_silent) || ' giorni — possibile abbandono',
        'churn_warning:' || v_rec.company_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name, 'days_silent', v_rec.days_silent),
        'Manda email check-in proattivo + offri sessione 1:1'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 5. ERRORS 5XX SPIKE — edge function failing rate >5/15min
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        task_kind,
        COUNT(*) AS n_errors
      FROM public.ai_model_usage_log
      WHERE ts >= now() - interval '15 minutes'
        AND ok = false
      GROUP BY task_kind
      HAVING COUNT(*) > 5
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'product',
        'critical',
        '🔥 Errori AI spike: ' || v_rec.task_kind,
        v_rec.n_errors || ' errori in 15 min su task ' || v_rec.task_kind,
        'errors_5xx_spike:' || v_rec.task_kind,
        jsonb_build_object('type', 'task_kind', 'name', v_rec.task_kind, 'errors', v_rec.n_errors),
        'Check Supabase logs + verifica rate limit OpenRouter'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ran_at', now(),
    'alerts_processed', v_alerts_created,
    'rules_executed', 5
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_admin_alerts_runner() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Schedule pg_cron — ogni 15 minuti
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Unschedule se già esiste
  PERFORM cron.unschedule('silvio-admin-alerts-runner-15min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-admin-alerts-runner-15min');

  -- Schedula
  PERFORM cron.schedule(
    'silvio-admin-alerts-runner-15min',
    '*/15 * * * *',  -- ogni 15 min
    'SELECT public.silvio_admin_alerts_runner();'
  );
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RAISE NOTICE 'pg_cron non disponibile — skip schedule. Configura manualmente.';
END;
$$;

COMMENT ON FUNCTION public.silvio_admin_alerts_runner IS
  'Sprint 2 — Cron 15min che popola silvio_admin_alerts con 5 regole proattive (payment_failed, demo_request, lead_silent_hot, churn_warning, errors_5xx_spike).';

COMMIT;
