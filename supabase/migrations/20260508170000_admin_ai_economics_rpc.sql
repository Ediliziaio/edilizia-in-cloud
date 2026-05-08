-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN AI ECONOMICS DASHBOARD RPC
-- -----------------------------------------------------------------------
-- RPC unico get_ai_economics_dashboard(p_period) che ritorna tutto il
-- necessario per il dashboard SuperAdmin in un singolo JSON:
--   • KPI globali (cost reale, fatturato, margine €/%, n_calls, n_companies)
--   • Breakdown per provider (OpenAI, Anthropic, Google, Mistral, ...)
--   • Breakdown per modello (top 20 per spesa)
--   • Top 10 aziende per spesa
--   • Trend giornaliero (ultimi 30gg)
--   • Render economics aggregati (sistema separato)
--   • Data quality: % chiamate con costo reale (x-or-cost) vs stimato
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_ai_economics_dashboard(
  p_period         TEXT DEFAULT 'mese',  -- 'oggi'|'settimana'|'mese'|'anno'|'all'
  p_company_id     UUID DEFAULT NULL     -- filtra per azienda (NULL = tutte)
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since         TIMESTAMPTZ;
  v_since_prev    TIMESTAMPTZ;
  v_until_prev    TIMESTAMPTZ;
  v_kpi           JSONB;
  v_kpi_prev      JSONB;
  v_by_provider   JSONB;
  v_by_model      JSONB;
  v_by_company    JSONB;
  v_by_task       JSONB;
  v_daily_trend   JSONB;
  v_render        JSONB;
  v_data_quality  JSONB;
BEGIN
  -- 1. Calcola finestra temporale + finestra periodo precedente (per delta)
  v_since := CASE p_period
    WHEN 'oggi'      THEN now()::date
    WHEN 'settimana' THEN now() - interval '7 days'
    WHEN 'mese'      THEN now() - interval '30 days'
    WHEN 'anno'      THEN now() - interval '365 days'
    ELSE '1970-01-01'::timestamptz
  END;

  v_since_prev := v_since - (now() - v_since);
  v_until_prev := v_since;

  -- ─────────────────────────────────────────────────────────────────────
  -- 2. KPI globali (periodo corrente)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'cost_real_eur',   COALESCE(SUM(cost_real_eur), 0),
    'cost_billed_eur', COALESCE(SUM(cost_billed_eur), 0),
    'margin_eur',      COALESCE(SUM(margin_eur), 0),
    'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                        THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 2)
                        ELSE 0 END,
    'n_calls',         COUNT(*),
    'n_companies',     COUNT(DISTINCT company_id) FILTER (WHERE company_id IS NOT NULL),
    'tokens_total',    COALESCE(SUM(tokens_total), 0),
    'avg_cost_per_call_eur', CASE WHEN COUNT(*) > 0
                        THEN ROUND(SUM(cost_billed_eur)::NUMERIC / COUNT(*), 6)
                        ELSE 0 END
  ) INTO v_kpi
  FROM public.ai_model_usage_log
  WHERE ts >= v_since
    AND ok = true
    AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- 3. KPI periodo precedente (per delta)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'cost_real_eur',   COALESCE(SUM(cost_real_eur), 0),
    'cost_billed_eur', COALESCE(SUM(cost_billed_eur), 0),
    'margin_eur',      COALESCE(SUM(margin_eur), 0),
    'n_calls',         COUNT(*)
  ) INTO v_kpi_prev
  FROM public.ai_model_usage_log
  WHERE ts >= v_since_prev AND ts < v_until_prev
    AND ok = true
    AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- 4. Breakdown per PROVIDER (OpenAI, Anthropic, Google, Mistral, ...)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_agg(row_obj ORDER BY cost_real_eur DESC) INTO v_by_provider
  FROM (
    SELECT jsonb_build_object(
      'provider',        COALESCE(provider_used, split_part(model_used, '/', 1), 'unknown'),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 1)
                          ELSE 0 END,
      'tokens_total',    COALESCE(SUM(tokens_total), 0),
      'avg_markup_x',    CASE WHEN COALESCE(SUM(cost_real_eur), 0) > 0
                          THEN ROUND(SUM(cost_billed_eur) / SUM(cost_real_eur), 2)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(cost_real_eur), 0) AS cost_real_eur
    FROM public.ai_model_usage_log
    WHERE ts >= v_since
      AND ok = true
      AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY COALESCE(provider_used, split_part(model_used, '/', 1), 'unknown')
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- 5. Breakdown per MODELLO (top 20 per spesa reale)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_agg(row_obj ORDER BY cost_real_eur DESC) INTO v_by_model
  FROM (
    SELECT jsonb_build_object(
      'model_used',      model_used,
      'provider',        split_part(model_used, '/', 1),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 1)
                          ELSE 0 END,
      'avg_markup_x',    CASE WHEN COALESCE(SUM(cost_real_eur), 0) > 0
                          THEN ROUND(SUM(cost_billed_eur) / SUM(cost_real_eur), 2)
                          ELSE 0 END,
      'avg_cost_per_call_usd', ROUND(AVG(cost_usd)::NUMERIC, 8),
      'avg_tokens',      ROUND(AVG(tokens_total))
    ) AS row_obj,
    COALESCE(SUM(cost_real_eur), 0) AS cost_real_eur
    FROM public.ai_model_usage_log
    WHERE ts >= v_since
      AND ok = true
      AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY model_used
    ORDER BY COALESCE(SUM(cost_real_eur), 0) DESC
    LIMIT 20
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- 6. Top 10 aziende per spesa fatturata
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_agg(row_obj ORDER BY cost_billed_eur DESC) INTO v_by_company
  FROM (
    SELECT jsonb_build_object(
      'company_id',      l.company_id,
      'company_name',    COALESCE(c.name, 'Sconosciuta'),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(l.cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(l.cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(l.margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(l.cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(l.margin_eur) / SUM(l.cost_billed_eur) * 100, 1)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(l.cost_billed_eur), 0) AS cost_billed_eur
    FROM public.ai_model_usage_log l
    LEFT JOIN public.companies c ON c.id = l.company_id
    WHERE l.ts >= v_since
      AND l.ok = true
      AND l.credits_deducted = true
      AND l.company_id IS NOT NULL
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.company_id, c.name
    ORDER BY COALESCE(SUM(l.cost_billed_eur), 0) DESC
    LIMIT 10
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- 7. Breakdown per TASK_KIND
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_agg(row_obj ORDER BY cost_billed_eur DESC) INTO v_by_task
  FROM (
    SELECT jsonb_build_object(
      'task_kind',       l.task_kind,
      'display_label',   COALESCE(
        (SELECT display_label FROM public.ai_pricing_markup pm
         WHERE pm.task_kind = l.task_kind AND pm.model_pattern IS NULL LIMIT 1),
        l.task_kind
      ),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(l.cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(l.cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(l.margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(l.cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(l.margin_eur) / SUM(l.cost_billed_eur) * 100, 1)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(l.cost_billed_eur), 0) AS cost_billed_eur
    FROM public.ai_model_usage_log l
    WHERE l.ts >= v_since
      AND l.ok = true
      AND l.credits_deducted = true
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.task_kind
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- 8. Trend giornaliero (sempre ultimi 30gg, indipendente dal periodo)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_agg(row_obj ORDER BY day) INTO v_daily_trend
  FROM (
    SELECT jsonb_build_object(
      'day',             DATE_TRUNC('day', ts)::date,
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4)
    ) AS row_obj,
    DATE_TRUNC('day', ts)::date AS day
    FROM public.ai_model_usage_log
    WHERE ts >= now() - interval '30 days'
      AND ok = true
      AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY DATE_TRUNC('day', ts)
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- 9. RENDER ECONOMICS — sistema separato (gpt-image-1)
  --    Lettura da render_credit_ledger (consume = costi reali per render)
  -- ─────────────────────────────────────────────────────────────────────
  -- Prova a leggere render_credit_ledger se esiste, altrimenti NULL
  BEGIN
    EXECUTE 'SELECT jsonb_build_object(
      ''n_renders'',          COUNT(*) FILTER (WHERE tipo = ''consume''),
      ''cost_real_eur'',      COALESCE(ABS(SUM(cost_real_eur)) FILTER (WHERE tipo = ''consume''), 0),
      ''revenue_eur'',        COALESCE(ABS(SUM(revenue_eur)) FILTER (WHERE tipo = ''consume''), 0),
      ''margin_eur'',         COALESCE(ABS(SUM(revenue_eur)) FILTER (WHERE tipo = ''consume''), 0)
                              - COALESCE(ABS(SUM(cost_real_eur)) FILTER (WHERE tipo = ''consume''), 0),
      ''topup_eur'',          COALESCE(SUM(amount_eur) FILTER (WHERE tipo = ''topup''), 0),
      ''refund_eur'',         COALESCE(ABS(SUM(amount_eur)) FILTER (WHERE tipo = ''refund''), 0)
    ) FROM public.render_credit_ledger
    WHERE created_at >= $1
      AND ($2::uuid IS NULL OR company_id = $2)'
    INTO v_render
    USING v_since, p_company_id;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_render := jsonb_build_object(
        'n_renders', 0, 'cost_real_eur', 0, 'revenue_eur', 0,
        'margin_eur', 0, 'topup_eur', 0, 'refund_eur', 0,
        'note', 'render_credit_ledger non disponibile o schema diverso'
      );
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 10. DATA QUALITY — quante chiamate hanno costo reale vs stimato
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'n_calls_total',     COUNT(*),
    'n_calls_real_cost', COUNT(*) FILTER (WHERE COALESCE(cost_is_estimated, false) = false),
    'n_calls_estimated', COUNT(*) FILTER (WHERE cost_is_estimated = true),
    'pct_real',          CASE WHEN COUNT(*) > 0
                          THEN ROUND(
                            COUNT(*) FILTER (WHERE COALESCE(cost_is_estimated, false) = false)::NUMERIC
                            / COUNT(*) * 100, 1)
                          ELSE 100 END
  ) INTO v_data_quality
  FROM public.ai_model_usage_log
  WHERE ts >= v_since
    AND ok = true
    AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- 11. Compose final JSON
  -- ─────────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'period',         p_period,
    'since',          v_since,
    'now',            now(),
    'kpi',            COALESCE(v_kpi, '{}'::jsonb),
    'kpi_prev',       COALESCE(v_kpi_prev, '{}'::jsonb),
    'by_provider',    COALESCE(v_by_provider, '[]'::jsonb),
    'by_model',       COALESCE(v_by_model, '[]'::jsonb),
    'by_company',     COALESCE(v_by_company, '[]'::jsonb),
    'by_task',        COALESCE(v_by_task, '[]'::jsonb),
    'daily_trend',    COALESCE(v_daily_trend, '[]'::jsonb),
    'render',         COALESCE(v_render, '{}'::jsonb),
    'data_quality',   COALESCE(v_data_quality, '{}'::jsonb),
    -- Esposizione tasso USD→EUR e markup config corrente
    'usd_eur_rate',   COALESCE(
      (SELECT NULLIF(value,'')::NUMERIC FROM public.platform_settings WHERE key='usd_eur_rate'),
      0.92
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.get_ai_economics_dashboard IS
  'SuperAdmin AI economics dashboard. p_period: oggi|settimana|mese|anno|all. '
  'Ritorna costi reali OpenRouter, fatturato, margine, breakdown provider/modello/azienda/task, '
  'trend giornaliero, render economics, data quality. RLS: solo super_admin via frontend check.';

COMMIT;
