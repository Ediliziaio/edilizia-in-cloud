-- Sales OS — Sprint 1.1: auth check nelle 4 RPC
--
-- Le 4 RPC (get_weighted_pipeline, get_sales_forecast,
-- get_stalled_opportunities, get_sales_velocity) accettavano p_company_id
-- SENZA verificare che l'utente appartenesse a quella company. Con
-- SECURITY DEFINER bypassavano RLS → potential data leak cross-tenant.
--
-- Fix: helper `ensure_sales_os_access(company_id)` chiamato all'inizio
-- di ogni RPC. Lancia eccezione se utente non autorizzato.

BEGIN;

-- ── Helper: verifica che auth.uid() abbia accesso alla company ────────────
CREATE OR REPLACE FUNCTION public.ensure_sales_os_access(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_role TEXT;
  v_is_member BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session' USING ERRCODE = '42501';
  END IF;

  -- super_admin ha accesso a tutte le company
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  ORDER BY CASE role WHEN 'super_admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_role = 'super_admin' THEN
    RETURN;
  END IF;

  -- altrimenti deve esistere riga user_roles con company_id matchante
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid
      AND company_id = p_company_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'unauthorized: no access to company %', p_company_id
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_sales_os_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_sales_os_access(UUID) TO authenticated;

-- Drop funzioni esistenti prima di ricrearle (return type potenzialmente diverso)
DROP FUNCTION IF EXISTS public.get_weighted_pipeline(UUID);
DROP FUNCTION IF EXISTS public.get_sales_forecast(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_stalled_opportunities(UUID);
DROP FUNCTION IF EXISTS public.get_sales_velocity(UUID, INTEGER);

-- ── 1) get_weighted_pipeline con auth check ───────────────────────────────
CREATE OR REPLACE FUNCTION get_weighted_pipeline(p_company_id UUID)
RETURNS TABLE (
  pipeline_id UUID, pipeline_name TEXT, stage_id UUID, stage_name TEXT,
  stage_position INTEGER, opportunity_count BIGINT, total_value DECIMAL,
  weighted_value DECIMAL, avg_probability INTEGER
) AS $$
DECLARE v_max_position INTEGER;
BEGIN
  PERFORM public.ensure_sales_os_access(p_company_id);

  SELECT MAX(ps.position) INTO v_max_position
  FROM marketing_pipeline_stages ps WHERE ps.company_id = p_company_id;

  RETURN QUERY
  SELECT
    p.id, p.name, ps.id, ps.name, ps.position,
    COUNT(o.id),
    COALESCE(SUM(o.value), 0),
    COALESCE(SUM(o.value * (
      COALESCE(o.probability, ps.win_probability,
        ROUND((0.1 + 0.8 * COALESCE(CAST(ps.position AS DECIMAL) /
        NULLIF(CAST(v_max_position AS DECIMAL), 0), 0.5)) * 100)
      ) / 100.0
    )), 0),
    ROUND(AVG(COALESCE(o.probability, ps.win_probability,
      ROUND((0.1 + 0.8 * COALESCE(CAST(ps.position AS DECIMAL) /
      NULLIF(CAST(v_max_position AS DECIMAL), 0), 0.5)) * 100)
    )))::INTEGER
  FROM marketing_pipelines p
  INNER JOIN marketing_pipeline_stages ps ON ps.pipeline_id = p.id AND ps.company_id = p_company_id
  LEFT JOIN marketing_opportunities o ON o.stage_id = ps.id
    AND o.company_id = p_company_id AND o.status = 'open'
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name, ps.id, ps.name, ps.position
  ORDER BY p.name, ps.position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2) get_sales_forecast con auth check ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_sales_forecast(
  p_company_id UUID, p_months_ahead INTEGER DEFAULT 3
)
RETURNS TABLE (
  forecast_month DATE, expected_revenue DECIMAL,
  weighted_revenue DECIMAL, opportunity_count BIGINT
) AS $$
BEGIN
  PERFORM public.ensure_sales_os_access(p_company_id);

  RETURN QUERY
  SELECT
    DATE_TRUNC('month', o.expected_close_date)::DATE,
    COALESCE(SUM(o.value), 0),
    COALESCE(SUM(o.value * COALESCE(o.probability, 50) / 100.0), 0),
    COUNT(*)
  FROM marketing_opportunities o
  WHERE o.company_id = p_company_id
    AND o.status = 'open'
    AND o.expected_close_date IS NOT NULL
    AND o.expected_close_date >= CURRENT_DATE
    AND o.expected_close_date < CURRENT_DATE + (p_months_ahead || ' months')::INTERVAL
  GROUP BY DATE_TRUNC('month', o.expected_close_date)
  ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 3) get_stalled_opportunities con auth check ──────────────────────────
-- Usa COALESCE(last_activity_at, updated_at) come riferimento attività:
-- last_activity_at viene aggiornato dal trigger su marketing_contact_activities
-- e dal BEFORE UPDATE su marketing_opportunities (migration 20261024100100).
CREATE OR REPLACE FUNCTION get_stalled_opportunities(p_company_id UUID)
RETURNS TABLE (
  opportunity_id UUID, opportunity_name TEXT, contact_name TEXT,
  stage_name TEXT, value DECIMAL, days_stalled INTEGER,
  stalled_threshold INTEGER, assigned_to UUID, last_activity TIMESTAMPTZ
) AS $$
BEGIN
  PERFORM public.ensure_sales_os_access(p_company_id);

  RETURN QUERY
  WITH opp AS (
    SELECT o.id, o.name, o.value, o.status, o.assigned_to, o.stage_id,
      o.contact_id, o.company_id,
      COALESCE(o.last_activity_at, o.updated_at) AS last_activity_at
    FROM marketing_opportunities o
    WHERE o.company_id = p_company_id AND o.status = 'open'
  )
  SELECT
    o.id, o.name,
    COALESCE(NULLIF(TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')), ''), c.company_name, ''),
    ps.name, o.value,
    EXTRACT(DAY FROM NOW() - o.last_activity_at)::INTEGER,
    COALESCE(ps.stalled_threshold_days, 14),
    o.assigned_to,
    o.last_activity_at
  FROM opp o
  LEFT JOIN marketing_contacts c ON c.id = o.contact_id
  LEFT JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id
  WHERE EXTRACT(DAY FROM NOW() - o.last_activity_at) >= COALESCE(ps.stalled_threshold_days, 14)
  ORDER BY 6 DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4) get_sales_velocity con auth check + guard div-by-zero ─────────────
CREATE OR REPLACE FUNCTION get_sales_velocity(
  p_company_id UUID, p_days_back INTEGER DEFAULT 90
)
RETURNS TABLE (
  open_opportunities BIGINT, won_in_period BIGINT, lost_in_period BIGINT,
  win_rate DECIMAL, avg_deal_size DECIMAL, avg_cycle_days DECIMAL,
  sales_velocity DECIMAL
) AS $$
DECLARE
  v_open BIGINT; v_won BIGINT; v_lost BIGINT;
  v_avg_deal DECIMAL; v_avg_days DECIMAL; v_safe_days DECIMAL;
BEGIN
  PERFORM public.ensure_sales_os_access(p_company_id);

  SELECT COUNT(*) INTO v_open FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'open';

  SELECT COUNT(*) INTO v_won FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'won'
    AND updated_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  SELECT COUNT(*) INTO v_lost FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'lost'
    AND updated_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  SELECT COALESCE(AVG(value), 0) INTO v_avg_deal FROM marketing_opportunities
  WHERE company_id = p_company_id AND status = 'won'
    AND updated_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM updated_at - created_at)), 0)
  INTO v_avg_days
  FROM marketing_opportunities
  WHERE company_id = p_company_id AND status IN ('won', 'lost')
    AND updated_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  -- Guard div-by-zero: se nessun ciclo completato, assume 1 giorno minimo
  v_safe_days := GREATEST(v_avg_days, 1);

  RETURN QUERY SELECT v_open, v_won, v_lost,
    CASE WHEN (v_won + v_lost) > 0
      THEN ROUND((v_won::DECIMAL / (v_won + v_lost)::DECIMAL) * 100, 2)
      ELSE 0 END,
    ROUND(v_avg_deal, 2),
    ROUND(v_avg_days, 1),
    CASE WHEN (v_won + v_lost) > 0
      THEN ROUND((v_open * (v_won::DECIMAL / (v_won + v_lost)) * v_avg_deal) / v_safe_days, 2)
      ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
