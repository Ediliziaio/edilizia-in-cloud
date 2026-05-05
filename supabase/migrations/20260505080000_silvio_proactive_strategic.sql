-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-22 — AI Proattività Strategica (FASE I)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. RPC silvio_executive_report (snapshot KPI completo per AI exec briefing)
-- 2. RPC silvio_detect_frodi_anomalie (pattern detection: pagamenti sospetti, etc.)
-- 3. AI Router config: report_executive + fraud_detection
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) RPC: silvio_executive_report — snapshot data-rich per LLM exec briefing
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_executive_report(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders jsonb;
  v_revenue jsonb;
  v_cashflow jsonb;
  v_team jsonb;
  v_alerts jsonb;
  v_ltv jsonb;
BEGIN
  -- Orders snapshot
  SELECT jsonb_build_object(
    'attivi', count(*) FILTER (WHERE status IN ('nuovo','in_corso','in_lavorazione')),
    'completati_30gg', count(*) FILTER (WHERE status = 'concluso' AND updated_at > now() - interval '30 days'),
    'totale_attivi_eur', ROUND(SUM(total_amount) FILTER (WHERE status IN ('nuovo','in_corso','in_lavorazione'))::numeric, 2),
    'media_ordine_eur', ROUND(AVG(total_amount)::numeric, 2)
  ) INTO v_orders
  FROM public.orders WHERE company_id = p_company_id;

  -- Revenue / fatturato YTD
  SELECT jsonb_build_object(
    'ytd_eur', ROUND(SUM(total_amount) FILTER (
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    )::numeric, 2),
    'mese_corrente_eur', ROUND(SUM(total_amount) FILTER (
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
    )::numeric, 2),
    'mese_precedente_eur', ROUND(SUM(total_amount) FILTER (
      WHERE created_at >= date_trunc('month', CURRENT_DATE) - interval '1 month'
        AND created_at < date_trunc('month', CURRENT_DATE)
    )::numeric, 2)
  ) INTO v_revenue
  FROM public.orders WHERE company_id = p_company_id;

  -- Cashflow snapshot (riusa silvio_cashflow_forecast_90d)
  v_cashflow := public.silvio_cashflow_forecast_90d(p_company_id, 13, true);
  -- Estrai solo metadata key
  v_cashflow := jsonb_build_object(
    'saldo_oggi_eur', v_cashflow->>'saldo_oggi_eur',
    'saldo_atteso_fine_periodo_eur', v_cashflow->>'saldo_atteso_fine_periodo_eur',
    'critical_weeks_count', v_cashflow->>'critical_weeks_count',
    'warning_weeks_count', v_cashflow->>'warning_weeks_count',
    'totale_incassi_previsti_eur', v_cashflow->>'totale_incassi_previsti_eur',
    'totale_uscite_previste_eur', v_cashflow->>'totale_uscite_previste_eur'
  );

  -- Team
  SELECT jsonb_build_object(
    'attivi', count(*),
    'costo_mensile_lordo', ROUND(SUM(gross_salary)::numeric, 2),
    'costo_mensile_netto', ROUND(SUM(net_salary)::numeric, 2)
  ) INTO v_team
  FROM public.employees WHERE company_id = p_company_id AND COALESCE(is_active, true);

  -- Alerts open
  SELECT jsonb_build_object(
    'critici', count(*) FILTER (WHERE severity = 'critical'),
    'warning', count(*) FILTER (WHERE severity = 'warning'),
    'info', count(*) FILTER (WHERE severity = 'info'),
    'totali_open', count(*)
  ) INTO v_alerts
  FROM public.silvio_alerts WHERE company_id = p_company_id AND status = 'open';

  -- LTV summary (top customer + at_risk count)
  SELECT jsonb_build_object(
    'totale_clienti', count(*),
    'ltv_totale_12m_eur', ROUND(SUM(ltv_predetto_12m_eur)::numeric, 2),
    'a_rischio_count', count(*) FILTER (WHERE churn_risk IN ('alto','perso')),
    'top_cliente', (SELECT client_display_name FROM public.customer_ltv_snapshots
                    WHERE company_id = p_company_id
                    ORDER BY ltv_predetto_12m_eur DESC NULLS LAST LIMIT 1)
  ) INTO v_ltv
  FROM public.customer_ltv_snapshots WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'snapshot_at', now(),
    'orders', COALESCE(v_orders, '{}'::jsonb),
    'revenue', COALESCE(v_revenue, '{}'::jsonb),
    'cashflow', COALESCE(v_cashflow, '{}'::jsonb),
    'team', COALESCE(v_team, '{}'::jsonb),
    'alerts', COALESCE(v_alerts, '{}'::jsonb),
    'ltv', COALESCE(v_ltv, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_executive_report(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_executive_report(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: silvio_detect_frodi_anomalie — pattern detection
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_detect_frodi_anomalie(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anomalie jsonb := '[]'::jsonb;
BEGIN
  -- 1) Ordini con sconto >50% (potenziale errore o frode)
  v_anomalie := v_anomalie || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tipo', 'sconto_anomalo',
      'severita', 'media',
      'order_id', id,
      'order_code', order_code,
      'cliente', COALESCE(client_company, client_name),
      'descrizione', format('Ordine con sconto > 50%% rispetto importo medio'),
      'importo_eur', total_amount
    ))
    FROM public.orders
    WHERE company_id = p_company_id
      AND created_at > now() - interval '90 days'
      AND total_amount > 0
      AND total_amount < (
        SELECT AVG(total_amount) * 0.4
        FROM public.orders
        WHERE company_id = p_company_id
          AND total_amount > 0
      )
    LIMIT 5
  ), '[]'::jsonb);

  -- 2) Fatture passive duplicate (sfrutta anomalie_rilevate)
  v_anomalie := v_anomalie || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tipo', 'fattura_duplicata',
      'severita', 'alta',
      'fattura_id', id,
      'cedente', cedente_ragione_sociale,
      'numero', numero_fattura,
      'data', data_fattura,
      'importo_eur', totale_documento,
      'descrizione', 'Possibile fattura duplicata (stesso cedente+numero+data)'
    ))
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND COALESCE(anomalie_rilevate, '[]'::jsonb) ? 'duplicato_sospetto'
    LIMIT 5
  ), '[]'::jsonb);

  -- 3) Fatture importi anomali
  v_anomalie := v_anomalie || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tipo', 'importo_anomalo',
      'severita', 'media',
      'fattura_id', id,
      'cedente', cedente_ragione_sociale,
      'importo_eur', totale_documento,
      'descrizione', 'Importo anomalo rispetto storico cedente (>3 sigma)'
    ))
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND COALESCE(anomalie_rilevate, '[]'::jsonb) ? 'importo_anomalo'
    LIMIT 5
  ), '[]'::jsonb);

  -- 4) Pagamenti molto in ritardo (rate scadute >180gg)
  v_anomalie := v_anomalie || COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tipo', 'pagamento_molto_in_ritardo',
      'severita', 'alta',
      'order_id', id,
      'cliente', COALESCE(client_company, client_name),
      'importo_scaduto_eur', balance_amount,
      'gg_ritardo', (CURRENT_DATE - balance_expected_date),
      'descrizione', 'Saldo scaduto da oltre 180 giorni'
    ))
    FROM public.orders
    WHERE company_id = p_company_id
      AND COALESCE(balance_paid, false) = false
      AND balance_expected_date IS NOT NULL
      AND balance_expected_date < CURRENT_DATE - INTERVAL '180 days'
      AND COALESCE(balance_amount, 0) > 0
    LIMIT 5
  ), '[]'::jsonb);

  RETURN jsonb_build_object(
    'anomalie_count', jsonb_array_length(v_anomalie),
    'anomalie', v_anomalie,
    'computed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_detect_frodi_anomalie(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_detect_frodi_anomalie(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) AI Router config
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'report_executive',
    'Executive Briefing AI',
    'Genera report esecutivo settimanale dai KPI snapshot',
    'anthropic/claude-haiku-4.5',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.3,"max_tokens":2000}'::jsonb,
    't3_balanced',
    'analytics',
    true
  ),
  (
    'fraud_anomaly_review',
    'Fraud / Anomaly Review',
    'Analizza anomalie rilevate e suggerisce azioni',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.1,"max_tokens":1500}'::jsonb,
    't1_economic',
    'compliance',
    true
  )
ON CONFLICT (task_key) DO UPDATE
  SET task_label = EXCLUDED.task_label,
      task_description = EXCLUDED.task_description,
      primary_model = EXCLUDED.primary_model,
      fallback_models = EXCLUDED.fallback_models,
      default_params = EXCLUDED.default_params,
      tier_key = EXCLUDED.tier_key,
      category = EXCLUDED.category;

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config
    WHERE task_key IN ('report_executive','fraud_anomaly_review');
  RAISE NOTICE 'AI Router strategic: % task registrati (atteso 2)', v_cnt;
END $$;
