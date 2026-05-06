-- MP-FAT-04 — Cashflow Forecast AI 90 giorni
-- ════════════════════════════════════════════════════════════════════════════
-- Estende sistema forecast esistente con: 3 scenari (realistic/best/worst),
-- proiezione giornaliera 90gg, alert preventivi, action recommendations AI.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cashflow_forecast_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  forecast_date   date NOT NULL,
  scenario        text NOT NULL CHECK (scenario IN ('realistic','best','worst')),
  horizon_days    int NOT NULL DEFAULT 90,

  -- Proiezione giornaliera (array 90 elementi: {date, balance_eur, inflows, outflows})
  daily_balances  jsonb NOT NULL,
  starting_balance_eur numeric(12,2),

  min_balance_eur numeric(12,2),
  min_balance_date date,
  max_balance_eur numeric(12,2),

  risk_days_count int,
  risk_days_list  jsonb,
  first_risk_date date,

  -- AI recommendations azioni correttive
  ai_recommendations jsonb,
  ai_persona_used text NOT NULL DEFAULT 'cfo',
  ai_cost_billed_eur numeric(10,4),
  ai_confidence   numeric(3,2),

  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_forecast_daily UNIQUE (company_id, forecast_date, scenario)
);

CREATE INDEX IF NOT EXISTS idx_cashflow_snapshots_company_date
  ON public.cashflow_forecast_snapshots(company_id, forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_cashflow_snapshots_risk
  ON public.cashflow_forecast_snapshots(company_id, first_risk_date)
  WHERE first_risk_date IS NOT NULL;

ALTER TABLE public.cashflow_forecast_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashflow_snap_company ON public.cashflow_forecast_snapshots;
CREATE POLICY cashflow_snap_company ON public.cashflow_forecast_snapshots FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cashflow_snap_admin ON public.cashflow_forecast_snapshots;
CREATE POLICY cashflow_snap_admin ON public.cashflow_forecast_snapshots FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS cashflow_snap_super_admin ON public.cashflow_forecast_snapshots;
CREATE POLICY cashflow_snap_super_admin ON public.cashflow_forecast_snapshots FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_get_cashflow_forecast_scenarios
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_get_cashflow_forecast_scenarios(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_realistic jsonb;
  v_best jsonb;
  v_worst jsonb;
BEGIN
  -- Carica ultimo snapshot per ogni scenario (forecast_date più recente)
  SELECT jsonb_build_object(
    'forecast_date', forecast_date,
    'min_balance_eur', min_balance_eur,
    'min_balance_date', min_balance_date,
    'max_balance_eur', max_balance_eur,
    'risk_days_count', risk_days_count,
    'first_risk_date', first_risk_date,
    'ai_recommendations', ai_recommendations,
    'daily_balances', daily_balances
  ) INTO v_realistic
  FROM public.cashflow_forecast_snapshots
  WHERE company_id = p_company_id AND scenario = 'realistic'
  ORDER BY forecast_date DESC LIMIT 1;

  SELECT jsonb_build_object(
    'forecast_date', forecast_date,
    'min_balance_eur', min_balance_eur,
    'first_risk_date', first_risk_date
  ) INTO v_best
  FROM public.cashflow_forecast_snapshots
  WHERE company_id = p_company_id AND scenario = 'best'
  ORDER BY forecast_date DESC LIMIT 1;

  SELECT jsonb_build_object(
    'forecast_date', forecast_date,
    'min_balance_eur', min_balance_eur,
    'first_risk_date', first_risk_date,
    'risk_days_count', risk_days_count
  ) INTO v_worst
  FROM public.cashflow_forecast_snapshots
  WHERE company_id = p_company_id AND scenario = 'worst'
  ORDER BY forecast_date DESC LIMIT 1;

  v_result := jsonb_build_object(
    'realistic', COALESCE(v_realistic, '{}'::jsonb),
    'best', COALESCE(v_best, '{}'::jsonb),
    'worst', COALESCE(v_worst, '{}'::jsonb),
    'has_forecast', v_realistic IS NOT NULL
  );

  IF v_realistic IS NULL THEN
    v_result := v_result || jsonb_build_object(
      'note', 'Nessun forecast disponibile. Esegui edge ai-cashflow-forecast-builder per generarne uno.'
    );
  END IF;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_get_cashflow_forecast_scenarios(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_get_cashflow_forecast_scenarios(uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_save_cashflow_snapshot (chiamata da edge)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_save_cashflow_snapshot(
  p_company_id uuid,
  p_scenario text,
  p_starting_balance_eur numeric,
  p_daily_balances jsonb,
  p_min_balance_eur numeric,
  p_min_balance_date date,
  p_max_balance_eur numeric,
  p_risk_days_count int,
  p_risk_days_list jsonb,
  p_first_risk_date date,
  p_ai_recommendations jsonb,
  p_ai_cost_billed_eur numeric DEFAULT NULL,
  p_ai_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.cashflow_forecast_snapshots (
    company_id, forecast_date, scenario,
    starting_balance_eur, daily_balances,
    min_balance_eur, min_balance_date, max_balance_eur,
    risk_days_count, risk_days_list, first_risk_date,
    ai_recommendations, ai_cost_billed_eur, ai_confidence
  ) VALUES (
    p_company_id, CURRENT_DATE, p_scenario,
    p_starting_balance_eur, p_daily_balances,
    p_min_balance_eur, p_min_balance_date, p_max_balance_eur,
    p_risk_days_count, p_risk_days_list, p_first_risk_date,
    p_ai_recommendations, p_ai_cost_billed_eur, p_ai_confidence
  )
  ON CONFLICT (company_id, forecast_date, scenario) DO UPDATE
    SET starting_balance_eur = EXCLUDED.starting_balance_eur,
        daily_balances = EXCLUDED.daily_balances,
        min_balance_eur = EXCLUDED.min_balance_eur,
        min_balance_date = EXCLUDED.min_balance_date,
        max_balance_eur = EXCLUDED.max_balance_eur,
        risk_days_count = EXCLUDED.risk_days_count,
        risk_days_list = EXCLUDED.risk_days_list,
        first_risk_date = EXCLUDED.first_risk_date,
        ai_recommendations = EXCLUDED.ai_recommendations,
        ai_cost_billed_eur = EXCLUDED.ai_cost_billed_eur
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'snapshot_id', v_id, 'scenario', p_scenario);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_save_cashflow_snapshot(uuid, text, numeric, jsonb, numeric, date, numeric, int, jsonb, date, jsonb, numeric, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_save_cashflow_snapshot(uuid, text, numeric, jsonb, numeric, date, numeric, int, jsonb, date, jsonb, numeric, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_simula_intervento_cashflow (what-if analysis)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_simula_intervento_cashflow(
  p_company_id uuid,
  p_user_id uuid,
  p_intervention_type text,  -- 'sollecito_cliente' | 'posticipo_fornitore' | 'apertura_credito' | 'anticipo_sal'
  p_amount numeric,
  p_target_date date,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_realistic_min numeric;
  v_simulated_min numeric;
BEGIN
  SELECT min_balance_eur INTO v_realistic_min
    FROM public.cashflow_forecast_snapshots
   WHERE company_id = p_company_id AND scenario = 'realistic'
   ORDER BY forecast_date DESC LIMIT 1;

  -- Simula impatto:
  -- sollecito_cliente / anticipo_sal → +amount al saldo da target_date in poi
  -- posticipo_fornitore → +amount temporaneo (poi -amount alla nuova data)
  -- apertura_credito → +amount permanente
  v_simulated_min := COALESCE(v_realistic_min, 0)
    + CASE
        WHEN p_intervention_type IN ('sollecito_cliente','anticipo_sal','apertura_credito') THEN p_amount
        WHEN p_intervention_type = 'posticipo_fornitore' THEN p_amount  -- temporaneo
        ELSE 0
      END;

  RETURN jsonb_build_object(
    'intervention_type', p_intervention_type,
    'amount_eur', p_amount,
    'target_date', p_target_date,
    'realistic_min_balance_before', v_realistic_min,
    'simulated_min_balance_after', v_simulated_min,
    'improvement_eur', v_simulated_min - COALESCE(v_realistic_min, 0),
    'description', p_description,
    'note', 'Simulazione semplificata. Per analisi accurata serve ri-run forecast con intervento applicato.'
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_simula_intervento_cashflow(uuid, uuid, text, numeric, date, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_simula_intervento_cashflow(uuid, uuid, text, numeric, date, text)
  TO service_role;
