-- Complaints & Feedback Sentiment — gestione reclami con AI sentiment + auto-escalation
-- ════════════════════════════════════════════════════════════════════════════
-- Tracciamento reclami da multiple sorgenti (email, WhatsApp, web form, telefono).
-- AI classifica sentiment + urgenza + suggerisce risposta + auto-escalate critical.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Origine
  source text NOT NULL CHECK (source IN ('email', 'whatsapp', 'telegram', 'web_form', 'phone', 'review_google', 'review_facebook', 'visit_in_person', 'manual')),
  source_ref_id text,                    -- ID esterno se disponibile

  -- Cliente
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,

  -- Riferimenti business
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  related_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,

  -- Contenuto
  raw_text text NOT NULL,
  language text DEFAULT 'it',
  attachments jsonb DEFAULT '[]'::jsonb,    -- [{type, storage_path, name}]

  -- AI analysis
  ai_sentiment text CHECK (ai_sentiment IN ('positive', 'neutral', 'negative', 'very_negative')),
  ai_sentiment_score numeric(3,2),         -- -1.0 .. +1.0
  ai_urgency text CHECK (ai_urgency IN ('low', 'medium', 'high', 'critical')),
  ai_category text,                          -- 'lavori_difettosi' | 'ritardi' | 'fatturazione' | 'comunicazione' | 'prezzo' | 'sicurezza' | 'altro'
  ai_subcategory text,
  ai_summary text,
  ai_keywords jsonb DEFAULT '[]'::jsonb,
  ai_emotional_tone jsonb DEFAULT '[]'::jsonb,  -- ["frustrato", "deluso", "arrabbiato"]
  ai_intent text CHECK (ai_intent IN ('refund_request', 'rework_request', 'apology_request', 'just_venting', 'legal_threat', 'churn_signal', 'positive_feedback')),

  -- AI suggested actions
  ai_suggested_response text,
  ai_suggested_actions jsonb DEFAULT '[]'::jsonb,
  ai_compensation_suggested numeric(10,2),
  ai_root_cause_hypothesis text,
  ai_risk_assessment jsonb DEFAULT '{}'::jsonb,

  -- Workflow stato
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'analyzing', 'analyzed', 'in_progress', 'awaiting_customer', 'resolved', 'escalated', 'closed_no_action')),
  assigned_to uuid,
  escalated boolean DEFAULT false,
  escalated_at timestamptz,
  escalated_to uuid,
  escalation_reason text,

  -- Risoluzione
  resolution_notes text,
  resolution_action_taken text,
  customer_satisfied boolean,
  resolved_at timestamptz,
  resolved_by uuid,

  -- AI cost
  ai_persona_used text DEFAULT 'assistente_cliente',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_company_status
  ON public.customer_complaints(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_urgency
  ON public.customer_complaints(company_id, ai_urgency, status)
  WHERE ai_urgency IN ('high', 'critical') AND status NOT IN ('resolved', 'closed_no_action');
CREATE INDEX IF NOT EXISTS idx_complaints_contact
  ON public.customer_complaints(contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complaints_company ON public.customer_complaints;
CREATE POLICY complaints_company ON public.customer_complaints
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- Storico interazioni reclamo (timeline)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.complaint_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.customer_complaints(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,

  interaction_type text NOT NULL
    CHECK (interaction_type IN ('customer_message', 'internal_note', 'response_sent', 'escalation', 'status_change', 'ai_analysis')),
  channel text,                              -- 'email' | 'whatsapp' | 'phone' | 'in_person'

  content text,
  metadata jsonb DEFAULT '{}'::jsonb,

  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_interactions
  ON public.complaint_interactions(complaint_id, created_at);

ALTER TABLE public.complaint_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complaint_interactions_company ON public.complaint_interactions;
CREATE POLICY complaint_interactions_company ON public.complaint_interactions
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_create_complaint
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_create_complaint(
  p_company_id uuid,
  p_source text,
  p_raw_text text,
  p_customer_name text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_related_order_id uuid DEFAULT NULL,
  p_related_quote_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.customer_complaints(
    company_id, source, raw_text,
    customer_name, customer_email, customer_phone,
    contact_id, related_order_id, related_quote_id
  )
  VALUES (
    p_company_id, p_source, p_raw_text,
    p_customer_name, p_customer_email, p_customer_phone,
    p_contact_id, p_related_order_id, p_related_quote_id
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'complaint_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_create_complaint(uuid, text, text, text, text, text, uuid, uuid, uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_apply_complaint_analysis (chiamato da edge)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_apply_complaint_analysis(
  p_company_id uuid,
  p_complaint_id uuid,
  p_analysis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_should_escalate boolean := false;
BEGIN
  UPDATE public.customer_complaints SET
    ai_sentiment = p_analysis->>'sentiment',
    ai_sentiment_score = (p_analysis->>'sentiment_score')::numeric,
    ai_urgency = p_analysis->>'urgency',
    ai_category = p_analysis->>'category',
    ai_subcategory = p_analysis->>'subcategory',
    ai_summary = p_analysis->>'summary',
    ai_keywords = COALESCE(p_analysis->'keywords', '[]'::jsonb),
    ai_emotional_tone = COALESCE(p_analysis->'emotional_tone', '[]'::jsonb),
    ai_intent = p_analysis->>'intent',
    ai_suggested_response = p_analysis->>'suggested_response',
    ai_suggested_actions = COALESCE(p_analysis->'suggested_actions', '[]'::jsonb),
    ai_compensation_suggested = (p_analysis->>'compensation_suggested')::numeric,
    ai_root_cause_hypothesis = p_analysis->>'root_cause_hypothesis',
    ai_risk_assessment = COALESCE(p_analysis->'risk_assessment', '{}'::jsonb),
    ai_cost_billed_eur = COALESCE((p_analysis->>'ai_cost_eur')::numeric, 0),
    status = 'analyzed',
    updated_at = now()
  WHERE id = p_complaint_id AND company_id = p_company_id;

  -- Auto-escalation se critical o legal_threat
  v_should_escalate :=
    (p_analysis->>'urgency' = 'critical')
    OR (p_analysis->>'intent' = 'legal_threat')
    OR (p_analysis->>'intent' = 'churn_signal' AND p_analysis->>'urgency' IN ('high', 'critical'));

  IF v_should_escalate THEN
    UPDATE public.customer_complaints SET
      escalated = true,
      escalated_at = now(),
      escalation_reason = format('Auto-escalated: urgency=%s, intent=%s',
        p_analysis->>'urgency', p_analysis->>'intent'),
      status = 'escalated'
    WHERE id = p_complaint_id;

    -- Log interaction
    INSERT INTO public.complaint_interactions(
      complaint_id, company_id, interaction_type, content
    )
    VALUES (
      p_complaint_id, p_company_id, 'escalation',
      format('AI auto-escalated: %s/%s', p_analysis->>'urgency', p_analysis->>'intent')
    );
  END IF;

  -- Log AI analysis
  INSERT INTO public.complaint_interactions(
    complaint_id, company_id, interaction_type, content, metadata
  )
  VALUES (
    p_complaint_id, p_company_id, 'ai_analysis',
    p_analysis->>'summary', p_analysis
  );

  RETURN jsonb_build_object(
    'ok', true,
    'escalated', v_should_escalate,
    'urgency', p_analysis->>'urgency'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_apply_complaint_analysis(uuid, uuid, jsonb) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_reclami_aperti
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_reclami_aperti(
  p_company_id uuid,
  p_urgency_min text DEFAULT 'low'
)
RETURNS TABLE (
  id uuid,
  customer_name text,
  ai_urgency text,
  ai_sentiment text,
  ai_category text,
  ai_summary text,
  status text,
  escalated boolean,
  created_at timestamptz,
  hours_since_created numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_levels text[];
BEGIN
  v_levels := CASE p_urgency_min
    WHEN 'low' THEN ARRAY['low', 'medium', 'high', 'critical']
    WHEN 'medium' THEN ARRAY['medium', 'high', 'critical']
    WHEN 'high' THEN ARRAY['high', 'critical']
    WHEN 'critical' THEN ARRAY['critical']
    ELSE ARRAY['low', 'medium', 'high', 'critical']
  END;

  RETURN QUERY
  SELECT c.id, c.customer_name, c.ai_urgency, c.ai_sentiment, c.ai_category, c.ai_summary,
    c.status, c.escalated, c.created_at,
    ROUND(EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600.0, 1)
  FROM public.customer_complaints c
  WHERE c.company_id = p_company_id
    AND c.status NOT IN ('resolved', 'closed_no_action')
    AND (c.ai_urgency IS NULL OR c.ai_urgency = ANY(v_levels))
  ORDER BY
    CASE c.ai_urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
    c.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_reclami_aperti(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_resolve_complaint
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_resolve_complaint(
  p_company_id uuid,
  p_complaint_id uuid,
  p_resolution_notes text,
  p_action_taken text DEFAULT NULL,
  p_customer_satisfied boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.customer_complaints SET
    status = 'resolved',
    resolution_notes = p_resolution_notes,
    resolution_action_taken = p_action_taken,
    customer_satisfied = p_customer_satisfied,
    resolved_at = now(),
    resolved_by = auth.uid(),
    updated_at = now()
  WHERE id = p_complaint_id AND company_id = p_company_id;

  INSERT INTO public.complaint_interactions(
    complaint_id, company_id, interaction_type, content, user_id
  )
  VALUES (
    p_complaint_id, p_company_id, 'status_change',
    format('Resolved: %s', p_resolution_notes), auth.uid()
  );

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_resolve_complaint(uuid, uuid, text, text, boolean) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Complaints sentiment system ready (4 RPC, 2 tabelle, auto-escalation)'; END $$;
