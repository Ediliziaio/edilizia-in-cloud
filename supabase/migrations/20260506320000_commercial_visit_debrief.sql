-- Commercial Visit Debrief — analisi AI post-visita commerciale
-- ════════════════════════════════════════════════════════════════════════════
-- Dopo una visita cliente, il rappresentante carica audio + foto.
-- AI estrae sentiment, intent, segnali d'acquisto, suggested_actions.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commercial_visit_debriefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Riferimenti business
  visited_contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  related_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  visited_by_user_id uuid,
  visit_date date DEFAULT current_date,
  visit_location text,

  -- Input grezzi
  audio_storage_path text,
  audio_transcript text,
  audio_duration_sec numeric,
  image_paths text[] DEFAULT '{}',
  free_notes text,

  -- AI analysis output
  ai_summary text,
  ai_sentiment text CHECK (ai_sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  ai_sentiment_score numeric(3,2),       -- -1.0 .. +1.0
  ai_intent text CHECK (ai_intent IN ('ready_to_buy', 'evaluating', 'comparing', 'just_info', 'not_interested')),
  ai_intent_confidence numeric(3,2),
  ai_buying_signals jsonb DEFAULT '[]'::jsonb,    -- ["urgency_high", "budget_confirmed", ...]
  ai_objections jsonb DEFAULT '[]'::jsonb,        -- ["price_concern", "timing_issue", ...]
  ai_competitors_mentioned jsonb DEFAULT '[]'::jsonb,
  ai_estimated_close_probability_pct numeric(5,2),
  ai_estimated_value_eur numeric(12,2),
  ai_suggested_actions jsonb DEFAULT '[]'::jsonb, -- [{action, priority, deadline_days}]
  ai_suggested_next_visit_days int,

  -- AI persona + cost
  ai_persona_used text DEFAULT 'sales',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'reviewed', 'error')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_debrief_company_date
  ON public.commercial_visit_debriefs(company_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visit_debrief_contact
  ON public.commercial_visit_debriefs(visited_contact_id);
CREATE INDEX IF NOT EXISTS idx_visit_debrief_user
  ON public.commercial_visit_debriefs(visited_by_user_id, visit_date DESC);

ALTER TABLE public.commercial_visit_debriefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visit_debrief_company ON public.commercial_visit_debriefs;
CREATE POLICY visit_debrief_company ON public.commercial_visit_debriefs
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_create_visit_debrief
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_create_visit_debrief(
  p_company_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_quote_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_audio_path text DEFAULT NULL,
  p_image_paths text[] DEFAULT NULL,
  p_free_notes text DEFAULT NULL,
  p_visit_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.commercial_visit_debriefs(
    company_id, visited_contact_id, related_quote_id, related_order_id,
    visited_by_user_id, audio_storage_path, image_paths, free_notes, visit_location
  )
  VALUES (
    p_company_id, p_contact_id, p_quote_id, p_order_id,
    auth.uid(), p_audio_path, p_image_paths, p_free_notes, p_visit_location
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'debrief_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_create_visit_debrief(uuid, uuid, uuid, uuid, text, text[], text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_apply_visit_debrief_analysis (chiamato dall'edge)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_apply_visit_debrief_analysis(
  p_company_id uuid,
  p_debrief_id uuid,
  p_analysis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.commercial_visit_debriefs SET
    audio_transcript = p_analysis->>'transcript',
    ai_summary = p_analysis->>'summary',
    ai_sentiment = p_analysis->>'sentiment',
    ai_sentiment_score = (p_analysis->>'sentiment_score')::numeric,
    ai_intent = p_analysis->>'intent',
    ai_intent_confidence = (p_analysis->>'intent_confidence')::numeric,
    ai_buying_signals = COALESCE(p_analysis->'buying_signals', '[]'::jsonb),
    ai_objections = COALESCE(p_analysis->'objections', '[]'::jsonb),
    ai_competitors_mentioned = COALESCE(p_analysis->'competitors', '[]'::jsonb),
    ai_estimated_close_probability_pct = (p_analysis->>'close_probability_pct')::numeric,
    ai_estimated_value_eur = (p_analysis->>'estimated_value_eur')::numeric,
    ai_suggested_actions = COALESCE(p_analysis->'suggested_actions', '[]'::jsonb),
    ai_suggested_next_visit_days = (p_analysis->>'next_visit_days')::int,
    ai_cost_billed_eur = COALESCE((p_analysis->>'ai_cost_eur')::numeric, 0),
    status = 'completed',
    updated_at = now()
  WHERE id = p_debrief_id AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_apply_visit_debrief_analysis(uuid, uuid, jsonb) TO service_role, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_visite_a_rischio — debrief con ML hot ma non followup
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_visite_a_rischio(
  p_company_id uuid,
  p_days_back int DEFAULT 14
)
RETURNS TABLE (
  debrief_id uuid,
  contact_id uuid,
  visit_date date,
  ai_intent text,
  ai_close_probability_pct numeric,
  ai_estimated_value_eur numeric,
  days_since_visit int,
  ai_summary text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.visited_contact_id, d.visit_date, d.ai_intent,
    d.ai_estimated_close_probability_pct, d.ai_estimated_value_eur,
    (current_date - d.visit_date)::int,
    d.ai_summary
  FROM public.commercial_visit_debriefs d
  WHERE d.company_id = p_company_id
    AND d.status = 'completed'
    AND d.ai_intent IN ('ready_to_buy', 'evaluating')
    AND d.ai_estimated_close_probability_pct >= 50
    AND d.visit_date >= (current_date - make_interval(days => p_days_back))
  ORDER BY d.ai_estimated_close_probability_pct DESC, d.ai_estimated_value_eur DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_visite_a_rischio(uuid, int) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Commercial visit debrief system ready'; END $$;
