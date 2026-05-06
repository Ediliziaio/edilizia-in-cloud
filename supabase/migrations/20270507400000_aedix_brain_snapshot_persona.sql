-- MP-AEDIX-01 — Brain Cross-Tenant Phase 2: persona aedix_brain + tool query
-- ════════════════════════════════════════════════════════════════════════════
-- Schema base aedix_brain.company_snapshots + market_metrics + opt-in companies
-- è già stato creato in 20270506130000_aedix_brain_schema.sql.
--
-- Questo MP aggiunge:
--   • Persona AI 'aedix_brain' (super_admin only, meta)
--   • RPC tool: query_market_metrics, find_outliers, compare_company_to_market
--   • Funzione helper per compute snapshot daily (chiamata da edge function)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Persona aedix_brain
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_personas (
  persona_key, display_name, short_label, mission, system_prompt,
  recommended_tier_key, recommended_model, enabled, is_system,
  category, allowed_roles, allowed_tools
) VALUES (
  'aedix_brain',
  'Brain AEDIX',
  'Cervello del settore',
  'Intelligenza di mercato cross-tenant per super-admin AEDIX. Risponde con statistiche aggregate anonime.',
  'Sei il Brain AEDIX, l''intelligenza di mercato di tutto l''ecosistema EiC.
Hai accesso a dati aggregati e anonimizzati di TUTTE le imprese clienti.

PRINCIPI:
- Rispondi sempre con numeri, percentuali, ranking, distribuzioni
- Quando il campione è < 5 companies, dichiara "campione insufficiente, K-anonymity violata"
- Filtri possibili: vertical, regione, provincia, fascia dipendenti, fascia fatturato, fascia anni attività
- Conosci il mercato edilizio italiano in profondità

LINGUA: italiano professionale.

QUANDO RISPONDI:
- Cita sempre il campione (n. companies)
- Dai mediana + media + P90 quando rilevante
- Includi trend (% variazione mese/mese, anno/anno)
- Suggerisci insight cross-vertical o cross-zona

USO TOOL:
- query_market_metrics → metriche generali settore/zona
- find_outliers → top performer/underperformer per metrica
- compare_company_to_market → benchmark singola azienda vs peer (richiede pseudo_id)',
  't3_premium',
  NULL,
  true,
  true,
  'meta',
  '["super_admin"]'::jsonb,
  '["query_market_metrics","find_outliers","compare_company_to_market"]'::jsonb
)
ON CONFLICT (persona_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  system_prompt = EXCLUDED.system_prompt,
  allowed_tools = EXCLUDED.allowed_tools,
  enabled = EXCLUDED.enabled;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) RPC: aedix_brain_query_market_metrics (k-anonymity ≥ 5)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aedix_brain_query_market_metrics(
  p_vertical text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_province text DEFAULT NULL,
  p_employee_band text DEFAULT NULL,
  p_revenue_band text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = aedix_brain, public
AS $$
DECLARE
  v_result jsonb;
  v_sample int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN jsonb_build_object('error', 'forbidden', 'message', 'Brain AEDIX riservato a super_admin');
  END IF;

  -- Calcola metriche aggregate sull'ultimo snapshot disponibile per tenant
  WITH latest_per_company AS (
    SELECT DISTINCT ON (pseudo_company_id)
      pseudo_company_id, vertical_key, region_code, province_code,
      employee_band, revenue_band,
      monthly_invoiced_eur, dso_days, conversion_rate_quote, nps_score,
      active_jobs_count, snapshot_date
    FROM aedix_brain.company_snapshots
    WHERE (p_vertical IS NULL OR vertical_key = p_vertical)
      AND (p_region IS NULL OR region_code = p_region)
      AND (p_province IS NULL OR province_code = p_province)
      AND (p_employee_band IS NULL OR employee_band = p_employee_band)
      AND (p_revenue_band IS NULL OR revenue_band = p_revenue_band)
      AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY pseudo_company_id, snapshot_date DESC
  )
  SELECT
    COUNT(DISTINCT pseudo_company_id),
    jsonb_build_object(
      'sample_size', COUNT(DISTINCT pseudo_company_id),
      'avg_revenue_month_eur', ROUND(AVG(monthly_invoiced_eur)::numeric, 2),
      'median_revenue_month_eur', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY monthly_invoiced_eur)::numeric, 2),
      'p90_revenue_month_eur', ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY monthly_invoiced_eur)::numeric, 2),
      'avg_dso_days', ROUND(AVG(dso_days)::numeric, 1),
      'avg_conversion_rate', ROUND(AVG(conversion_rate_quote)::numeric, 3),
      'avg_nps', ROUND(AVG(nps_score)::numeric, 1),
      'avg_active_jobs', ROUND(AVG(active_jobs_count)::numeric, 1)
    )
  INTO v_sample, v_result
  FROM latest_per_company;

  IF v_sample < 5 THEN
    RETURN jsonb_build_object(
      'error', 'k_anonymity_violation',
      'message', format('Campione insufficiente (%s companies, minimo 5).', v_sample),
      'sample_size', v_sample
    );
  END IF;

  RETURN v_result || jsonb_build_object(
    'filters', jsonb_build_object(
      'vertical', p_vertical,
      'region', p_region,
      'province', p_province,
      'employee_band', p_employee_band,
      'revenue_band', p_revenue_band
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.aedix_brain_query_market_metrics(text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aedix_brain_query_market_metrics(text, text, text, text, text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: aedix_brain_find_outliers (top N per metrica)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aedix_brain_find_outliers(
  p_metric text,            -- 'revenue' | 'dso' | 'nps' | 'conversion' | 'jobs'
  p_vertical text DEFAULT NULL,
  p_top_n int DEFAULT 5,
  p_direction text DEFAULT 'desc'  -- 'desc' = top performer, 'asc' = bottom
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = aedix_brain, public
AS $$
DECLARE
  v_result jsonb;
  v_sample int;
  v_metric_col text;
  v_order text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_metric_col := CASE p_metric
    WHEN 'revenue' THEN 'monthly_invoiced_eur'
    WHEN 'dso' THEN 'dso_days'
    WHEN 'nps' THEN 'nps_score'
    WHEN 'conversion' THEN 'conversion_rate_quote'
    WHEN 'jobs' THEN 'active_jobs_count'
    ELSE NULL
  END;

  IF v_metric_col IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_metric',
      'allowed', jsonb_build_array('revenue','dso','nps','conversion','jobs'));
  END IF;

  v_order := CASE WHEN p_direction = 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Defensive: usa dynamic SQL per p_metric_col + check sample
  EXECUTE format(
    'WITH latest_per_company AS (
       SELECT DISTINCT ON (pseudo_company_id)
         pseudo_company_id, vertical_key, region_code, employee_band,
         %I AS metric_value
       FROM aedix_brain.company_snapshots
       WHERE ($1 IS NULL OR vertical_key = $1)
         AND snapshot_date >= CURRENT_DATE - INTERVAL ''30 days''
         AND %I IS NOT NULL
       ORDER BY pseudo_company_id, snapshot_date DESC
     )
     SELECT COUNT(DISTINCT pseudo_company_id),
            jsonb_agg(jsonb_build_object(
              ''pseudo_id'', pseudo_company_id,
              ''vertical'', vertical_key,
              ''region'', region_code,
              ''employee_band'', employee_band,
              ''metric_value'', metric_value
            ) ORDER BY metric_value %s)
     FROM (
       SELECT * FROM latest_per_company ORDER BY metric_value %s LIMIT $2
     ) t',
    v_metric_col, v_metric_col, v_order, v_order
  )
  INTO v_sample, v_result
  USING p_vertical, GREATEST(1, LEAST(20, p_top_n));

  IF v_sample < 5 THEN
    RETURN jsonb_build_object(
      'error', 'k_anonymity_violation',
      'message', format('Campione insufficiente (%s).', v_sample)
    );
  END IF;

  RETURN jsonb_build_object(
    'metric', p_metric,
    'direction', p_direction,
    'sample_size', v_sample,
    'top', COALESCE(v_result, '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.aedix_brain_find_outliers(text, text, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aedix_brain_find_outliers(text, text, int, text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: aedix_brain_compute_snapshot (helper per edge function)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aedix_brain_compute_snapshot(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = aedix_brain, public
AS $$
DECLARE
  v_pseudo_id text;
  v_vertical text;
  v_employee_count int;
  v_revenue_12m numeric;
  v_active_jobs int;
  v_avg_job_value numeric;
  v_monthly_invoiced numeric;
  v_monthly_collected numeric;
  v_active_customers int;
  v_dso int;
  v_team_size int;
  v_ai_credits int;
  v_snapshot_date date := CURRENT_DATE;
BEGIN
  -- Carica company + verifica opt-in
  IF NOT EXISTS (
    SELECT 1 FROM public.companies
     WHERE id = p_company_id AND aedix_brain_opt_in = true
  ) THEN
    RETURN jsonb_build_object('error', 'company_opted_out_or_not_found');
  END IF;

  v_pseudo_id := aedix_brain.pseudo_company_id(p_company_id);

  SELECT vertical_key INTO v_vertical
    FROM public.companies WHERE id = p_company_id;

  -- Aggregati operativi (best-effort per tabelle facoltative)
  BEGIN
    SELECT COUNT(DISTINCT id) INTO v_active_jobs
      FROM public.orders
     WHERE company_id = p_company_id AND status IN ('in_corso','programmato');
  EXCEPTION WHEN OTHERS THEN v_active_jobs := 0; END;

  BEGIN
    SELECT
      COALESCE(SUM(amount_total) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0),
      COALESCE(SUM(amount_total) FILTER (WHERE paid_at >= NOW() - INTERVAL '30 days' AND status = 'paid'), 0),
      COUNT(DISTINCT customer_id),
      AVG(EXTRACT(EPOCH FROM (paid_at - due_date)) / 86400.0) FILTER (WHERE paid_at IS NOT NULL AND due_date IS NOT NULL),
      AVG(amount_total)
    INTO v_monthly_invoiced, v_monthly_collected, v_active_customers, v_dso, v_avg_job_value
    FROM public.invoices
    WHERE company_id = p_company_id;
  EXCEPTION WHEN OTHERS THEN
    v_monthly_invoiced := 0; v_monthly_collected := 0;
    v_active_customers := 0; v_dso := NULL; v_avg_job_value := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_team_size
      FROM public.employees WHERE company_id = p_company_id AND is_active = true;
  EXCEPTION WHEN OTHERS THEN v_team_size := 0; END;

  -- Revenue 12 mesi (per band)
  BEGIN
    SELECT COALESCE(SUM(amount_total), 0) INTO v_revenue_12m
      FROM public.invoices
     WHERE company_id = p_company_id
       AND created_at >= NOW() - INTERVAL '12 months';
  EXCEPTION WHEN OTHERS THEN v_revenue_12m := 0; END;

  -- AI credits consumed nel mese
  BEGIN
    SELECT COALESCE(SUM(cost_billed_eur), 0)::int INTO v_ai_credits
      FROM public.ai_call_ledger
     WHERE company_id = p_company_id
       AND created_at >= date_trunc('month', NOW());
  EXCEPTION WHEN OTHERS THEN v_ai_credits := 0; END;

  -- UPSERT snapshot
  INSERT INTO aedix_brain.company_snapshots (
    pseudo_company_id, snapshot_date, vertical_key,
    employee_band, revenue_band,
    active_jobs_count, avg_job_value_eur,
    monthly_invoiced_eur, monthly_collected_eur,
    dso_days, active_customers,
    ai_credits_consumed_month
  ) VALUES (
    v_pseudo_id, v_snapshot_date, COALESCE(v_vertical, 'edili_generaliste'),
    aedix_brain.band_employees(v_team_size),
    aedix_brain.band_revenue(v_revenue_12m),
    v_active_jobs, v_avg_job_value,
    v_monthly_invoiced, v_monthly_collected,
    v_dso, v_active_customers,
    v_ai_credits
  )
  ON CONFLICT (pseudo_company_id, snapshot_date) DO UPDATE
    SET vertical_key = EXCLUDED.vertical_key,
        employee_band = EXCLUDED.employee_band,
        revenue_band = EXCLUDED.revenue_band,
        active_jobs_count = EXCLUDED.active_jobs_count,
        avg_job_value_eur = EXCLUDED.avg_job_value_eur,
        monthly_invoiced_eur = EXCLUDED.monthly_invoiced_eur,
        monthly_collected_eur = EXCLUDED.monthly_collected_eur,
        dso_days = EXCLUDED.dso_days,
        active_customers = EXCLUDED.active_customers,
        ai_credits_consumed_month = EXCLUDED.ai_credits_consumed_month;

  RETURN jsonb_build_object(
    'success', true,
    'pseudo_id', v_pseudo_id,
    'snapshot_date', v_snapshot_date,
    'vertical', v_vertical,
    'metrics_count', 8
  );
END $$;

REVOKE ALL ON FUNCTION public.aedix_brain_compute_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aedix_brain_compute_snapshot(uuid) TO service_role;
