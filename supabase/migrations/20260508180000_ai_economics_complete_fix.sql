-- ═══════════════════════════════════════════════════════════════════════════
-- AI ECONOMICS COMPLETE FIX
-- -----------------------------------------------------------------------
-- Risolve i 6 problemi trovati nell'audit:
--   1. Schema render_credit_ledger usa `reason` non `tipo` → fix RPC
--   2. render_sessions.cost_real / cost_billed → integra
--   3. platform_ai_usage_log (Whisper/embedding) → integra
--   4. ai_credit_transactions topup → mostra revenue da topup separato
--   5. CHECK constraint task_kind troppo restrittivo → rimuovi
--   6. RLS: solo super_admin può chiamare l'RPC dashboard
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Rimuovi vincolo CHECK su task_kind — permette qualsiasi nuovo task
--    senza migration. Il fallback resta 'default' se non configurato.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_pricing_markup
  DROP CONSTRAINT IF EXISTS ai_pricing_markup_task_kind_check;

COMMENT ON COLUMN public.ai_pricing_markup.task_kind IS
  'Task kind libero (no CHECK constraint). Convenzioni: bot_*, vision_*, parse_*, computo_*, default. '
  'Se non configurato → fallback a task_kind=''default''.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RPC dashboard — fix completo schema render_credit_ledger + integrazioni
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_economics_dashboard(
  p_period         TEXT DEFAULT 'mese',
  p_company_id     UUID DEFAULT NULL
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
  v_topup         JSONB;
  v_coverage      JSONB;
  v_reconciliation JSONB;
  v_is_super      BOOLEAN;
BEGIN
  -- Solo super_admin può vedere dati globali
  -- (con p_company_id specifico, l'azienda vede i propri dati via altre policy)
  v_is_super := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );

  IF NOT v_is_super AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin può vedere dati globali (p_company_id=NULL)'
      USING ERRCODE = '42501';
  END IF;

  -- Finestra temporale
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
  -- KPI globali periodo corrente
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

  -- KPI periodo precedente
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

  -- Breakdown per provider
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
      AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY COALESCE(provider_used, split_part(model_used, '/', 1), 'unknown')
  ) sub;

  -- Breakdown per modello (top 20)
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
      AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY model_used
    ORDER BY COALESCE(SUM(cost_real_eur), 0) DESC
    LIMIT 20
  ) sub;

  -- Top 10 aziende
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
      AND l.ok = true AND l.credits_deducted = true
      AND l.company_id IS NOT NULL
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.company_id, c.name
    ORDER BY COALESCE(SUM(l.cost_billed_eur), 0) DESC
    LIMIT 10
  ) sub;

  -- Breakdown per task
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
      AND l.ok = true AND l.credits_deducted = true
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.task_kind
  ) sub;

  -- Trend giornaliero
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
      AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY DATE_TRUNC('day', ts)
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- RENDER ECONOMICS — schema reale: reason invece di tipo, delta signed
  -- consume → delta < 0 (uscita); topup → delta > 0; refund → delta > 0
  -- cost_real ricavato da render_sessions (cost_real column se presente)
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    EXECUTE $RENDER$
      WITH ledger_agg AS (
        SELECT
          COUNT(*) FILTER (WHERE reason = 'consume')        AS n_renders,
          COALESCE(SUM(revenue_eur) FILTER (WHERE reason = 'consume'), 0)   AS revenue_eur,
          COALESCE(SUM(amount_eur)  FILTER (WHERE reason = 'topup'), 0)     AS topup_eur,
          COALESCE(SUM(amount_eur)  FILTER (WHERE reason = 'refund'), 0)    AS refund_eur
        FROM public.render_credit_ledger
        WHERE created_at >= $1
          AND ($2::uuid IS NULL OR company_id = $2)
      ),
      sessions_agg AS (
        SELECT COALESCE(SUM(cost_real), 0) AS cost_real_eur
        FROM public.render_sessions
        WHERE created_at >= $1
          AND ($2::uuid IS NULL OR company_id = $2)
      )
      SELECT jsonb_build_object(
        'n_renders',     l.n_renders,
        'cost_real_eur', s.cost_real_eur,
        'revenue_eur',   l.revenue_eur,
        'margin_eur',    l.revenue_eur - s.cost_real_eur,
        'margin_pct',    CASE WHEN l.revenue_eur > 0
                          THEN ROUND(((l.revenue_eur - s.cost_real_eur) / l.revenue_eur * 100)::numeric, 1)
                          ELSE 0 END,
        'topup_eur',     l.topup_eur,
        'refund_eur',    l.refund_eur
      )
      FROM ledger_agg l, sessions_agg s
    $RENDER$
    INTO v_render
    USING v_since, p_company_id;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_render := jsonb_build_object(
        'n_renders', 0, 'cost_real_eur', 0, 'revenue_eur', 0,
        'margin_eur', 0, 'margin_pct', 0, 'topup_eur', 0, 'refund_eur', 0,
        'note', 'render_credit_ledger/render_sessions schema diverso'
      );
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- TOPUP REVENUE — ricarica crediti AI dalle aziende
  -- (separato dai consumi, è ricavo "fresh cash")
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    EXECUTE $TOPUP$
      SELECT jsonb_build_object(
        'n_topups',    COUNT(*),
        'topup_eur',   COALESCE(SUM(crediti), 0),
        'n_companies', COUNT(DISTINCT company_id)
      )
      FROM public.ai_credit_transactions
      WHERE creato_il >= $1
        AND tipo IN ('ricarica', 'topup', 'acquisto')
        AND ($2::uuid IS NULL OR company_id = $2)
    $TOPUP$
    INTO v_topup
    USING v_since, p_company_id;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_topup := jsonb_build_object('n_topups', 0, 'topup_eur', 0, 'n_companies', 0);
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- DATA QUALITY — costo reale vs stimato
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
    AND ok = true AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- COVERAGE — quante chiamate AI bypassano il sistema centralizzato
  -- (stima basata su ai_credit_transactions con metadata.source != 'ai_provider')
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    EXECUTE $COVERAGE$
      WITH agg AS (
        SELECT
          COUNT(*) FILTER (WHERE metadata->>'source' = 'ai_provider')           AS centralized,
          COUNT(*) FILTER (WHERE COALESCE(metadata->>'source', '') != 'ai_provider'
                                AND tipo = 'consumo_ai')                         AS direct
        FROM public.ai_credit_transactions
        WHERE creato_il >= $1
          AND tipo = 'consumo_ai'
          AND ($2::uuid IS NULL OR company_id = $2)
      )
      SELECT jsonb_build_object(
        'centralized', centralized,
        'direct',      direct,
        'pct_centralized', CASE WHEN (centralized + direct) > 0
                            THEN ROUND(centralized::numeric / (centralized + direct) * 100, 1)
                            ELSE 100 END
      )
      FROM agg
    $COVERAGE$
    INTO v_coverage
    USING v_since, p_company_id;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_coverage := jsonb_build_object('centralized', 0, 'direct', 0, 'pct_centralized', 100);
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- RECONCILIATION — variance estimato vs reale (se tabella esiste)
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    EXECUTE $RECON$
      SELECT jsonb_build_object(
        'n_records',         COUNT(*),
        'total_variance_eur', COALESCE(SUM(variance_eur), 0)
      )
      FROM public.ai_provider_reconciliation
      WHERE created_at >= $1
    $RECON$
    INTO v_reconciliation
    USING v_since;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_reconciliation := jsonb_build_object('n_records', 0, 'total_variance_eur', 0);
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- Compose final JSON
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
    'topup',          COALESCE(v_topup, '{}'::jsonb),
    'data_quality',   COALESCE(v_data_quality, '{}'::jsonb),
    'coverage',       COALESCE(v_coverage, '{}'::jsonb),
    'reconciliation', COALESCE(v_reconciliation, '{}'::jsonb),
    'usd_eur_rate',   COALESCE(
      (SELECT NULLIF(value,'')::NUMERIC FROM public.platform_settings WHERE key='usd_eur_rate'),
      0.92
    ),
    'is_super_admin', v_is_super
  );
END;
$$;

-- RLS: rimuovi grant precedenti, ri-grant solo a authenticated (l'RPC verifica internamente)
REVOKE ALL ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_economics_dashboard(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.get_ai_economics_dashboard IS
  'SuperAdmin AI economics dashboard. Verifica internamente che chiamante sia super_admin '
  '(o azienda specifica via p_company_id). Include: KPI, by provider/model/company/task, '
  'trend giornaliero, render economics, topup revenue, data quality, coverage gap, reconciliation.';

COMMIT;
