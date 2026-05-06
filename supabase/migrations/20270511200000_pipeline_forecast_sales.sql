-- MP-SALES-06 — Pipeline Forecast Sales
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pipeline_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  forecast_date date NOT NULL DEFAULT current_date,

  pipeline_total_eur numeric(12,2),
  pipeline_weighted_eur numeric(12,2),
  forecast_30d_eur numeric(12,2),
  forecast_60d_eur numeric(12,2),
  forecast_90d_eur numeric(12,2),

  quotes_in_pipeline_count int,
  hot_quotes_ids uuid[] DEFAULT '{}',
  stale_quotes_ids uuid[] DEFAULT '{}',

  ai_insights text,
  ai_persona_used text DEFAULT 'sales',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_pipeline_daily UNIQUE (company_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_company_date ON public.pipeline_forecasts(company_id, forecast_date DESC);

ALTER TABLE public.pipeline_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_admin ON public.pipeline_forecasts;
CREATE POLICY pipeline_admin ON public.pipeline_forecasts
  FOR ALL USING (company_id = public.get_my_company_id());

-- Estensione quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS ai_close_probability_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS ai_predicted_close_date date,
  ADD COLUMN IF NOT EXISTS ai_close_factors jsonb,
  ADD COLUMN IF NOT EXISTS ai_last_predicted_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_stima_probabilita_close_quote
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_stima_probabilita_close_quote(
  p_company_id uuid,
  p_quote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q record;
  v_prob numeric;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id;
  IF v_q IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quote_not_found');
  END IF;

  -- Heuristica baseline; in produzione l'edge function calcola con LLM
  v_prob := 50;
  IF v_q.viewed_at IS NOT NULL THEN v_prob := v_prob + 15; END IF;
  IF v_q.signed_at IS NOT NULL THEN v_prob := 95; END IF;
  IF v_q.refused_at IS NOT NULL THEN v_prob := 5; END IF;
  IF v_q.status = 'sent' AND v_q.sent_at IS NOT NULL AND (now() - v_q.sent_at) > interval '30 days' THEN
    v_prob := GREATEST(v_prob - 20, 10);
    v_factors := v_factors || jsonb_build_array('stale_over_30d');
  END IF;

  UPDATE public.quotes
     SET ai_close_probability_pct = v_prob,
         ai_predicted_close_date = (current_date + interval '30 days')::date,
         ai_close_factors = v_factors,
         ai_last_predicted_at = now()
   WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quote_id', p_quote_id,
    'probability_pct', v_prob,
    'factors', v_factors,
    'predicted_close_date', (current_date + interval '30 days')::date
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_stima_probabilita_close_quote(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_get_pipeline_forecast
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_get_pipeline_forecast(
  p_company_id uuid,
  p_horizon_days int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total numeric; v_weighted numeric; v_count int;
BEGIN
  SELECT
    COALESCE(SUM(total), 0),
    COALESCE(SUM(total * COALESCE(ai_close_probability_pct, 50) / 100.0), 0),
    count(*)
  INTO v_total, v_weighted, v_count
  FROM public.quotes
  WHERE company_id = p_company_id
    AND status IN ('sent','viewed','negotiating')
    AND signed_at IS NULL AND refused_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'horizon_days', p_horizon_days,
    'pipeline_total_eur', v_total,
    'pipeline_weighted_eur', v_weighted,
    'quotes_count', v_count,
    'forecast_30d_eur', v_weighted * 0.3,
    'forecast_60d_eur', v_weighted * 0.6,
    'forecast_90d_eur', v_weighted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_get_pipeline_forecast(uuid, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_identifica_quotes_da_followup
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_identifica_quotes_da_followup(
  p_company_id uuid,
  p_priority_threshold numeric DEFAULT 60
)
RETURNS TABLE (
  quote_id uuid,
  quote_number text,
  client_name text,
  total numeric,
  ai_close_probability_pct numeric,
  giorni_da_invio int,
  status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.quote_number, q.client_name, q.total, q.ai_close_probability_pct,
    CASE WHEN q.sent_at IS NOT NULL THEN EXTRACT(DAY FROM (now() - q.sent_at))::int ELSE NULL END,
    q.status
  FROM public.quotes q
  WHERE q.company_id = p_company_id
    AND q.status IN ('sent','viewed','negotiating')
    AND q.signed_at IS NULL AND q.refused_at IS NULL
    AND COALESCE(q.ai_close_probability_pct, 0) >= p_priority_threshold
  ORDER BY q.ai_close_probability_pct DESC NULLS LAST, q.total DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_identifica_quotes_da_followup(uuid, numeric) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_suggerisci_azione_per_quote
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_suggerisci_azione_per_quote(
  p_company_id uuid,
  p_quote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_q record;
  v_action text;
BEGIN
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id;
  IF v_q IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quote_not_found');
  END IF;

  v_action := CASE
    WHEN v_q.signed_at IS NOT NULL THEN 'già firmato — apri ordine'
    WHEN v_q.refused_at IS NOT NULL THEN 'rifiutato — winback dopo 60gg'
    WHEN v_q.viewed_at IS NULL AND v_q.sent_at IS NOT NULL AND (now() - v_q.sent_at) > interval '7 days'
      THEN 'cliente non ha aperto — re-invio con nuovo subject'
    WHEN v_q.viewed_at IS NOT NULL AND COALESCE(v_q.ai_close_probability_pct,0) > 70
      THEN 'aperto + alta probabilità — chiamata diretta entro 48h'
    WHEN v_q.sent_at IS NOT NULL AND (now() - v_q.sent_at) > interval '30 days'
      THEN 'stale — sollecito leggero o offerta migliorativa'
    ELSE 'monitora — attendi 7gg poi follow-up'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'quote_id', p_quote_id,
    'suggested_action', v_action,
    'probability_pct', v_q.ai_close_probability_pct
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_suggerisci_azione_per_quote(uuid, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-SALES-06 deployed: pipeline_forecasts + 4 RPC + quotes extended'; END $$;
