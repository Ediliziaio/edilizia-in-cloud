-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO SUPERADMIN — Toolkit Revenue (5 RPC readonly cross-tenant)
-- -----------------------------------------------------------------------
-- Tutti gli RPC verificano super_admin internamente e ritornano JSONB così
-- l'edge function silvio-admin-chat può iniettare il risultato direttamente
-- nel tool_result del modello AI.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) silvio_get_mrr_breakdown(period: '30d'|'90d'|'mtd'|'ytd')
--    MRR = somma dei prezzi mensili dei piani delle aziende paying.
--    Include: new_companies (in periodo), expansion (cambio piano +).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_mrr_breakdown(
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since         TIMESTAMPTZ;
  v_current_mrr   NUMERIC := 0;
  v_arr           NUMERIC := 0;
  v_n_paying      INT := 0;
  v_n_trial       INT := 0;
  v_n_unpaid      INT := 0;
  v_new_paying    INT := 0;
  v_new_mrr       NUMERIC := 0;
  v_avg_arpu      NUMERIC := 0;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  v_since := CASE p_period
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    WHEN 'mtd' THEN date_trunc('month', now())
    WHEN 'ytd' THEN date_trunc('year', now())
    ELSE now() - interval '30 days'
  END;

  -- Current MRR: company active/paying × prezzo piano
  SELECT
    COALESCE(SUM(p.price_monthly), 0),
    COUNT(*) FILTER (WHERE c.status IN ('active', 'paying')),
    COUNT(*) FILTER (WHERE c.status = 'trial'),
    COUNT(*) FILTER (WHERE c.status IN ('past_due', 'unpaid', 'payment_failed')
                     OR c.stripe_subscription_status IN ('past_due', 'unpaid'))
  INTO v_current_mrr, v_n_paying, v_n_trial, v_n_unpaid
  FROM public.companies c
  LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
  WHERE c.is_platform_admin_company = false
    AND c.status IN ('active', 'paying', 'trial', 'past_due', 'unpaid', 'payment_failed');

  v_arr := v_current_mrr * 12;
  v_avg_arpu := CASE WHEN v_n_paying > 0 THEN v_current_mrr / v_n_paying ELSE 0 END;

  -- New MRR (company create nel periodo)
  SELECT
    COUNT(*),
    COALESCE(SUM(p.price_monthly), 0)
  INTO v_new_paying, v_new_mrr
  FROM public.companies c
  LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
  WHERE c.is_platform_admin_company = false
    AND c.created_at >= v_since
    AND c.status IN ('active', 'paying');

  RETURN jsonb_build_object(
    'period', p_period,
    'since', v_since,
    'mrr_eur', ROUND(v_current_mrr::NUMERIC, 2),
    'arr_eur', ROUND(v_arr::NUMERIC, 2),
    'avg_arpu_eur', ROUND(v_avg_arpu::NUMERIC, 2),
    'companies_paying', v_n_paying,
    'companies_trial', v_n_trial,
    'companies_unpaid', v_n_unpaid,
    'new_paying_in_period', v_new_paying,
    'new_mrr_in_period_eur', ROUND(v_new_mrr::NUMERIC, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_mrr_breakdown(TEXT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) silvio_get_unpaid_customers(limit: int DEFAULT 20)
--    Aziende con pagamento fallito o status unpaid/past_due.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_unpaid_customers(
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_obj ORDER BY days_unpaid DESC NULLS LAST) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'status', c.status,
      'stripe_status', c.stripe_subscription_status,
      'plan', p.name,
      'monthly_eur', p.price_monthly,
      'days_unpaid', EXTRACT(DAY FROM now() - c.updated_at)::INT,
      'created_at', c.created_at,
      'last_updated_at', c.updated_at
    ) AS row_obj,
    EXTRACT(DAY FROM now() - c.updated_at)::INT AS days_unpaid
    FROM public.companies c
    LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
    WHERE c.is_platform_admin_company = false
      AND (
        c.status IN ('past_due', 'unpaid', 'payment_failed')
        OR c.stripe_subscription_status IN ('past_due', 'unpaid')
      )
    ORDER BY c.updated_at DESC
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object(
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'companies', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_unpaid_customers(INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) silvio_get_revenue_forecast(months_ahead: int DEFAULT 3)
--    Proiezione MRR sui prossimi N mesi basata su trend ultimi 90gg.
--    Modello semplice: avg_growth_rate negli ultimi 3 mesi → estrapolato.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_revenue_forecast(
  p_months_ahead INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_mrr   NUMERIC := 0;
  v_mrr_3mo_ago   NUMERIC := 0;
  v_mrr_6mo_ago   NUMERIC := 0;
  v_growth_rate   NUMERIC := 0;
  v_projections   JSONB := '[]'::jsonb;
  v_proj_value    NUMERIC;
  i INT;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- MRR oggi (somma piani attivi/paying)
  SELECT COALESCE(SUM(p.price_monthly), 0) INTO v_current_mrr
  FROM public.companies c
  LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
  WHERE c.is_platform_admin_company = false
    AND c.status IN ('active', 'paying');

  -- MRR 3mo ago: stessa logica ma escludendo company create dopo
  SELECT COALESCE(SUM(p.price_monthly), 0) INTO v_mrr_3mo_ago
  FROM public.companies c
  LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
  WHERE c.is_platform_admin_company = false
    AND c.status IN ('active', 'paying')
    AND c.created_at < now() - interval '3 months';

  -- Growth rate mensile = (current/3mo_ago) ^ (1/3) - 1
  IF v_mrr_3mo_ago > 0 THEN
    v_growth_rate := POWER(v_current_mrr / v_mrr_3mo_ago, 1.0 / 3.0) - 1;
  ELSE
    v_growth_rate := 0;
  END IF;

  -- Cap growth rate a [-30%, +50%] per evitare proiezioni assurde
  v_growth_rate := GREATEST(-0.30, LEAST(0.50, v_growth_rate));

  -- Proiezioni
  v_proj_value := v_current_mrr;
  FOR i IN 1..LEAST(p_months_ahead, 12) LOOP
    v_proj_value := v_proj_value * (1 + v_growth_rate);
    v_projections := v_projections || jsonb_build_object(
      'month_offset', i,
      'projected_mrr_eur', ROUND(v_proj_value::NUMERIC, 2),
      'projected_arr_eur', ROUND((v_proj_value * 12)::NUMERIC, 2)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'current_mrr_eur', ROUND(v_current_mrr::NUMERIC, 2),
    'mrr_3_months_ago_eur', ROUND(v_mrr_3mo_ago::NUMERIC, 2),
    'monthly_growth_rate_pct', ROUND((v_growth_rate * 100)::NUMERIC, 2),
    'projections', v_projections,
    'note', 'Forecast basato su CAGR 3mo. Cap ±30%/+50%. Non considera stagionalità o churn forecast.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_revenue_forecast(INT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) silvio_get_ai_costs_summary(period)
--    Quanto Florin sta spendendo in AI (OpenRouter) nel periodo.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_ai_costs_summary(
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  v_since := CASE p_period
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    WHEN 'mtd' THEN date_trunc('month', now())
    WHEN 'ytd' THEN date_trunc('year', now())
    ELSE now() - interval '30 days'
  END;

  RETURN (
    SELECT jsonb_build_object(
      'period', p_period,
      'since', v_since,
      'n_calls', COUNT(*),
      'total_cost_real_eur', ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'total_cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'total_margin_eur', ROUND(COALESCE(SUM(cost_billed_eur - cost_real_eur), 0)::NUMERIC, 4),
      'top_tasks', (
        SELECT jsonb_agg(jsonb_build_object(
          'task_key', task_key,
          'n_calls', n_calls,
          'cost_real_eur', cost_real_eur
        ) ORDER BY cost_real_eur DESC)
        FROM (
          SELECT task_key,
                 COUNT(*) AS n_calls,
                 ROUND(SUM(cost_real_eur)::NUMERIC, 4) AS cost_real_eur
          FROM public.ai_call_ledger
          WHERE created_at >= v_since
          GROUP BY task_key
          ORDER BY SUM(cost_real_eur) DESC NULLS LAST
          LIMIT 5
        ) t
      ),
      'avg_cost_per_call_eur', ROUND(
        COALESCE(AVG(cost_real_eur), 0)::NUMERIC, 6
      )
    )
    FROM public.ai_call_ledger
    WHERE created_at >= v_since
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_ai_costs_summary(TEXT) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) silvio_get_top_customers_by_revenue(limit)
--    Top N aziende per fatturato attivo (price_monthly).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_top_customers_by_revenue(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_obj ORDER BY monthly_eur DESC) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'plan', p.name,
      'monthly_eur', COALESCE(p.price_monthly, 0),
      'yearly_eur', COALESCE(p.price_monthly, 0) * 12,
      'status', c.status,
      'created_at', c.created_at,
      'months_active', EXTRACT(MONTH FROM age(now(), c.created_at))::INT
    ) AS row_obj,
    COALESCE(p.price_monthly, 0) AS monthly_eur
    FROM public.companies c
    LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
    WHERE c.is_platform_admin_company = false
      AND c.status IN ('active', 'paying')
      AND p.price_monthly > 0
    ORDER BY p.price_monthly DESC NULLS LAST
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object(
    'count', COALESCE(jsonb_array_length(v_result), 0),
    'companies', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_get_top_customers_by_revenue(INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_get_mrr_breakdown          IS 'Toolkit Silvio Admin: MRR/ARR/ARPU + nuovi MRR del periodo. Solo super_admin.';
COMMENT ON FUNCTION public.silvio_get_unpaid_customers       IS 'Toolkit Silvio Admin: aziende con pagamento fallito (past_due/unpaid). Solo super_admin.';
COMMENT ON FUNCTION public.silvio_get_revenue_forecast       IS 'Toolkit Silvio Admin: forecast MRR su CAGR 3mo. Solo super_admin.';
COMMENT ON FUNCTION public.silvio_get_ai_costs_summary       IS 'Toolkit Silvio Admin: costo AI da ai_call_ledger. Solo super_admin.';
COMMENT ON FUNCTION public.silvio_get_top_customers_by_revenue IS 'Toolkit Silvio Admin: top N aziende per fatturato. Solo super_admin.';

COMMIT;
