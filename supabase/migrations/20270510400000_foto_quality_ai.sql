-- MP-OPS-06 — Quality Check Foto Cantiere AI
-- ════════════════════════════════════════════════════════════════════════════
-- AI Vision automatica su foto cantiere per: qualità lavorazioni (1-10),
-- safety pass/fail (caschi, imbragature, ponteggi), order cantiere (1-10).
-- Alert immediato per safety critical.
--
-- Nota: foto_cantiere ha già campi `ai_qualita_score` etc. — questo MP
-- normalizza in tabella dedicata `foto_cantiere_analysis` con storia
-- analisi multiple per foto + scoring multi-dimensionale.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.foto_cantiere_analysis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id         uuid NOT NULL REFERENCES public.foto_cantiere(id) ON DELETE CASCADE,
  cantiere_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Scoring multi-dimensionale (1-10)
  quality_score   numeric(3,1),
  safety_score    numeric(3,1),
  order_score     numeric(3,1),
  overall_score   numeric(3,1) GENERATED ALWAYS AS (
    (COALESCE(quality_score, 5) + COALESCE(safety_score, 5) + COALESCE(order_score, 5)) / 3
  ) STORED,

  -- Detected
  detected_elements        jsonb,
  vertical_specific_checks jsonb,
  safety_issues            jsonb DEFAULT '[]'::jsonb,
  quality_issues           jsonb DEFAULT '[]'::jsonb,
  recommendations          text,

  -- Critical flag (safety < 5 OR safety_issues critical)
  has_critical_issue boolean NOT NULL DEFAULT false,
  alert_sent_at      timestamptz,
  alert_channels     text[],

  -- AI metadata
  ai_persona_used text NOT NULL DEFAULT 'tecnico',
  ai_model        text,
  ai_cost_billed_eur numeric(10,4),
  ai_confidence   numeric(3,2),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foto_analysis_cantiere
  ON public.foto_cantiere_analysis(cantiere_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foto_analysis_critical
  ON public.foto_cantiere_analysis(company_id, created_at DESC)
  WHERE has_critical_issue = true;
CREATE INDEX IF NOT EXISTS idx_foto_analysis_company_score
  ON public.foto_cantiere_analysis(company_id, overall_score DESC);

ALTER TABLE public.foto_cantiere_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS foto_analysis_company_read ON public.foto_cantiere_analysis;
CREATE POLICY foto_analysis_company_read ON public.foto_cantiere_analysis FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS foto_analysis_admin ON public.foto_cantiere_analysis;
CREATE POLICY foto_analysis_admin ON public.foto_cantiere_analysis FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS foto_analysis_super_admin ON public.foto_cantiere_analysis;
CREATE POLICY foto_analysis_super_admin ON public.foto_cantiere_analysis FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_analizza_qualita_foto (placeholder + log)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_qualita_foto(
  p_company_id uuid,
  p_user_id uuid,
  p_foto_id uuid,
  p_quality_score numeric,
  p_safety_score numeric,
  p_order_score numeric,
  p_detected_elements jsonb DEFAULT NULL,
  p_safety_issues jsonb DEFAULT '[]'::jsonb,
  p_quality_issues jsonb DEFAULT '[]'::jsonb,
  p_recommendations text DEFAULT NULL,
  p_ai_model text DEFAULT NULL,
  p_ai_cost_billed_eur numeric DEFAULT NULL,
  p_ai_confidence numeric DEFAULT NULL,
  p_vertical_specific_checks jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_foto RECORD;
  v_id uuid;
  v_critical boolean;
BEGIN
  SELECT id, order_id, company_id INTO v_foto
    FROM public.foto_cantiere WHERE id = p_foto_id;

  IF v_foto IS NULL OR v_foto.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Foto non trovata');
  END IF;

  -- Critical: safety < 5 OR safety_issues contiene severity=critical
  v_critical := (p_safety_score IS NOT NULL AND p_safety_score < 5)
    OR (p_safety_issues @> '[{"severity":"critical"}]'::jsonb);

  INSERT INTO public.foto_cantiere_analysis (
    foto_id, cantiere_id, company_id,
    quality_score, safety_score, order_score,
    detected_elements, vertical_specific_checks,
    safety_issues, quality_issues, recommendations,
    has_critical_issue,
    ai_model, ai_cost_billed_eur, ai_confidence
  ) VALUES (
    p_foto_id, v_foto.order_id, p_company_id,
    p_quality_score, p_safety_score, p_order_score,
    p_detected_elements, p_vertical_specific_checks,
    p_safety_issues, p_quality_issues, p_recommendations,
    v_critical,
    p_ai_model, p_ai_cost_billed_eur, p_ai_confidence
  )
  RETURNING id INTO v_id;

  -- Aggiorna anche foto_cantiere campi AI esistenti (back-compat)
  UPDATE public.foto_cantiere
     SET ai_qualita_score = LEAST(10, GREATEST(0, ROUND(p_quality_score)::int)),
         ai_qualita_livello = CASE
           WHEN p_quality_score IS NULL THEN NULL
           WHEN p_quality_score >= 8 THEN 'eccellente'
           WHEN p_quality_score >= 6 THEN 'buono'
           WHEN p_quality_score >= 4 THEN 'sufficiente'
           ELSE 'critico'
         END,
         ai_problemi_rilevati = p_quality_issues,
         ai_dpi_compliance = p_safety_issues,
         ai_riassunto = p_recommendations,
         ai_analizzata_at = NOW(),
         ai_model_used = p_ai_model
   WHERE id = p_foto_id;

  RETURN jsonb_build_object(
    'success', true,
    'analysis_id', v_id,
    'has_critical_issue', v_critical,
    'overall_score', (COALESCE(p_quality_score, 5) + COALESCE(p_safety_score, 5) + COALESCE(p_order_score, 5)) / 3,
    'message', CASE WHEN v_critical
      THEN '⚠️ Problema CRITICAL rilevato — alert PM in invio'
      ELSE format('Foto analizzata: Q=%s S=%s O=%s', p_quality_score, p_safety_score, p_order_score)
    END
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_analizza_qualita_foto(uuid, uuid, uuid, numeric, numeric, numeric, jsonb, jsonb, jsonb, text, text, numeric, numeric, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_qualita_foto(uuid, uuid, uuid, numeric, numeric, numeric, jsonb, jsonb, jsonb, text, text, numeric, numeric, jsonb)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_trend_qualita_cantiere
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_trend_qualita_cantiere(
  p_company_id uuid,
  p_user_id uuid,
  p_cantiere_id uuid,
  p_period_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'cantiere_id', p_cantiere_id,
    'period_days', p_period_days,
    'total_foto_analizzate', COUNT(*),
    'avg_quality_score', ROUND(AVG(quality_score)::numeric, 2),
    'avg_safety_score', ROUND(AVG(safety_score)::numeric, 2),
    'avg_order_score', ROUND(AVG(order_score)::numeric, 2),
    'avg_overall_score', ROUND(AVG(overall_score)::numeric, 2),
    'count_critical', COUNT(*) FILTER (WHERE has_critical_issue = true),
    'safety_issues_total', COALESCE(SUM(jsonb_array_length(safety_issues)), 0),
    'quality_issues_total', COALESCE(SUM(jsonb_array_length(quality_issues)), 0),
    'trend_last_7d_avg', (
      SELECT ROUND(AVG(overall_score)::numeric, 2)
        FROM public.foto_cantiere_analysis
       WHERE cantiere_id = p_cantiere_id AND created_at >= NOW() - INTERVAL '7 days'
    )
  ) INTO v_result
  FROM public.foto_cantiere_analysis
  WHERE cantiere_id = p_cantiere_id
    AND company_id = p_company_id
    AND created_at >= NOW() - (GREATEST(1, LEAST(365, p_period_days)) || ' days')::interval;

  RETURN COALESCE(v_result, jsonb_build_object('cantiere_id', p_cantiere_id, 'total_foto_analizzate', 0));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_trend_qualita_cantiere(uuid, uuid, uuid, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_trend_qualita_cantiere(uuid, uuid, uuid, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_foto_critical_recenti
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_foto_critical_recenti(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'foto', COALESCE(jsonb_agg(
      jsonb_build_object(
        'analysis_id', fa.id,
        'foto_id', fa.foto_id,
        'cantiere_id', fa.cantiere_id,
        'order_code', o.order_code,
        'overall_score', fa.overall_score,
        'safety_score', fa.safety_score,
        'safety_issues', fa.safety_issues,
        'quality_issues', fa.quality_issues,
        'recommendations', fa.recommendations,
        'storage_path', fc.storage_path,
        'taken_at', fc.taken_at,
        'created_at', fa.created_at,
        'alert_sent_at', fa.alert_sent_at
      ) ORDER BY fa.created_at DESC
    ) FILTER (WHERE fa.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.foto_cantiere_analysis fa
  JOIN public.foto_cantiere fc ON fc.id = fa.foto_id
  JOIN public.orders o ON o.id = fa.cantiere_id
  WHERE fa.company_id = p_company_id
    AND fa.has_critical_issue = true
    AND fa.created_at >= NOW() - (GREATEST(1, LEAST(90, p_days_back)) || ' days')::interval;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'foto', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_foto_critical_recenti(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_foto_critical_recenti(uuid, uuid, int) TO service_role;
