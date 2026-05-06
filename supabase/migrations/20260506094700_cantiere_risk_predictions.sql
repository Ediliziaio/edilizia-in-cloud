-- MP-PRED-02 — Cantiere Ritardo Prediction
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cantiere_risk_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  prediction_date date NOT NULL DEFAULT current_date,

  current_avanzamento_pct numeric(5,2),
  planned_avanzamento_pct numeric(5,2),
  velocity_last_4w numeric(8,2),
  velocity_average numeric(8,2),

  predicted_completion_date date,
  contractual_deadline date,
  delay_days_predicted int,
  delay_probability_pct numeric(5,2),

  risk_level text CHECK (risk_level IN ('low','medium','high','critical')),

  primary_causes jsonb DEFAULT '[]'::jsonb,
  contributing_factors jsonb DEFAULT '[]'::jsonb,
  ai_mitigations jsonb DEFAULT '[]'::jsonb,

  actual_completion_date date,
  prediction_accuracy_score numeric(3,2),

  ai_persona_used text DEFAULT 'pm_cantiere',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,
  alert_sent_at timestamptz,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_pred_company_date ON public.cantiere_risk_predictions(company_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_high ON public.cantiere_risk_predictions(risk_level) WHERE risk_level IN ('high','critical');

ALTER TABLE public.cantiere_risk_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS risk_pred_company ON public.cantiere_risk_predictions;
CREATE POLICY risk_pred_company ON public.cantiere_risk_predictions
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_predici_data_fine_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_predici_data_fine_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_latest jsonb;
BEGIN
  SELECT jsonb_build_object(
    'cantiere_id', cantiere_id,
    'prediction_date', prediction_date,
    'current_avanzamento_pct', current_avanzamento_pct,
    'predicted_completion_date', predicted_completion_date,
    'contractual_deadline', contractual_deadline,
    'delay_days_predicted', delay_days_predicted,
    'delay_probability_pct', delay_probability_pct,
    'risk_level', risk_level,
    'primary_causes', primary_causes,
    'mitigations', ai_mitigations
  )
  INTO v_latest
  FROM public.cantiere_risk_predictions
  WHERE company_id = p_company_id AND cantiere_id = p_cantiere_id
  ORDER BY prediction_date DESC LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_prediction_yet', 'next_step', 'edge:predict-cantiere-delays');
  END IF;

  RETURN jsonb_build_object('ok', true, 'prediction', v_latest);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_predici_data_fine_cantiere(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_analizza_cause_ritardo
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_cause_ritardo(
  p_company_id uuid,
  p_cantiere_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_causes jsonb; v_factors jsonb;
BEGIN
  SELECT primary_causes, contributing_factors
    INTO v_causes, v_factors
  FROM public.cantiere_risk_predictions
  WHERE company_id = p_company_id AND cantiere_id = p_cantiere_id
  ORDER BY prediction_date DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'primary_causes', COALESCE(v_causes, '[]'::jsonb),
    'contributing_factors', COALESCE(v_factors, '[]'::jsonb)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_cause_ritardo(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_piano_recovery_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_piano_recovery_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_target_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Placeholder: edge function predict-cantiere-delays calcola piano dettagliato
  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'target_date', p_target_date,
    'next_step', 'edge:predict-cantiere-delays produce piano recovery come action_proposal'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_piano_recovery_cantiere(uuid, uuid, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_lista_cantieri_a_rischio
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_cantieri_a_rischio(
  p_company_id uuid,
  p_risk_level_min text DEFAULT 'medium'
)
RETURNS TABLE (
  cantiere_id uuid,
  prediction_date date,
  risk_level text,
  delay_days_predicted int,
  delay_probability_pct numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_levels text[];
BEGIN
  v_levels := CASE p_risk_level_min
    WHEN 'low' THEN ARRAY['low','medium','high','critical']
    WHEN 'medium' THEN ARRAY['medium','high','critical']
    WHEN 'high' THEN ARRAY['high','critical']
    WHEN 'critical' THEN ARRAY['critical']
    ELSE ARRAY['medium','high','critical']
  END;

  RETURN QUERY
  SELECT DISTINCT ON (r.cantiere_id)
    r.cantiere_id, r.prediction_date, r.risk_level, r.delay_days_predicted, r.delay_probability_pct
  FROM public.cantiere_risk_predictions r
  WHERE r.company_id = p_company_id
    AND r.risk_level = ANY(v_levels)
  ORDER BY r.cantiere_id, r.prediction_date DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_cantieri_a_rischio(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_calcola_costo_ritardo
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_calcola_costo_ritardo(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_delay_days int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_penali_giorno numeric := 200;  -- default; in produzione legge dal contratto
  v_costi_extra_giorno numeric := 800;
BEGIN
  v_total := (v_penali_giorno + v_costi_extra_giorno) * p_delay_days;

  -- Recupera total_amount cantiere se esistente
  SELECT total_amount INTO v_total FROM public.orders WHERE id = p_cantiere_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'delay_days', p_delay_days,
    'penali_stimate_eur', v_penali_giorno * p_delay_days,
    'costi_extra_stimati_eur', v_costi_extra_giorno * p_delay_days,
    'totale_stimato_eur', (v_penali_giorno + v_costi_extra_giorno) * p_delay_days,
    'note', 'Stima default; configurare valori reali in companies.delay_default_*'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_calcola_costo_ritardo(uuid, uuid, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-PRED-02 deployed: cantiere_risk_predictions + 5 RPC'; END $$;
