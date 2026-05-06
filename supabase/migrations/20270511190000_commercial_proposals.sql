-- MP-SALES-05 — Proposal Commerciale PDF
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commercial_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE,
  customer_id uuid,  -- no FK rigida (no tabella customers)

  proposal_version int DEFAULT 1,

  cover_title text,
  about_us_section text,
  solution_summary text,
  why_us_points jsonb DEFAULT '[]'::jsonb,
  case_studies_referenced uuid[] DEFAULT '{}',
  guarantees_section text,
  faq jsonb DEFAULT '[]'::jsonb,
  cta_section text,

  brand_logo_url text,
  brand_primary_color text,
  brand_secondary_color text,

  pdf_storage_path text,
  pdf_pages_count int,

  signed_url text,
  sent_at timestamptz,
  opened_at timestamptz,
  page_views jsonb DEFAULT '[]'::jsonb,
  customer_signed_at timestamptz,

  outcome text CHECK (outcome IN ('pending','accepted','rejected','negotiating','expired')),
  resulted_in_order_id uuid REFERENCES public.orders(id),

  ai_persona_used text DEFAULT 'sales',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_company ON public.commercial_proposals(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_quote ON public.commercial_proposals(quote_id);
CREATE INDEX IF NOT EXISTS idx_proposals_outcome ON public.commercial_proposals(company_id, outcome) WHERE outcome IS NOT NULL;

ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_company ON public.commercial_proposals;
CREATE POLICY proposals_company ON public.commercial_proposals
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_proposal_commerciale
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_proposal_commerciale(
  p_company_id uuid,
  p_quote_id uuid,
  p_force_regenerate boolean DEFAULT false,
  p_target_audience text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_existing
  FROM public.commercial_proposals
  WHERE company_id = p_company_id AND quote_id = p_quote_id
  ORDER BY proposal_version DESC LIMIT 1;

  IF v_existing IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object('ok', true, 'already_exists', true, 'proposal_id', v_existing);
  END IF;

  INSERT INTO public.commercial_proposals(company_id, quote_id, proposal_version, outcome)
  VALUES (p_company_id, p_quote_id, COALESCE((SELECT max(proposal_version)+1 FROM public.commercial_proposals WHERE quote_id=p_quote_id), 1), 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'proposal_id', v_id, 'next_step', 'edge:ai-proposal-generator', 'target_audience', p_target_audience);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_proposal_commerciale(uuid, uuid, boolean, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_trova_case_studies_simili
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_trova_case_studies_simili(
  p_company_id uuid,
  p_quote_id uuid,
  p_similarity_threshold numeric DEFAULT 0.6
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo_lavoro text; v_total numeric;
  v_results jsonb;
BEGIN
  SELECT tipo_lavoro, total INTO v_tipo_lavoro, v_total FROM public.quotes
  WHERE id = p_quote_id AND company_id = p_company_id;

  -- Cerca orders simili (stesso tipo_lavoro, importo entro ±30%)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', id,
    'description', description,
    'total_amount', total_amount,
    'work_end_date', work_end_date,
    'fulfillment_status', fulfillment_status
  )), '[]'::jsonb)
    INTO v_results
  FROM (
    SELECT id, description, total_amount, work_end_date, fulfillment_status
    FROM public.orders
    WHERE company_id = p_company_id
      AND fulfillment_status IN ('completed','closed')
      AND total_amount BETWEEN COALESCE(v_total, 0) * 0.7 AND COALESCE(v_total, 1e12) * 1.3
      AND (v_tipo_lavoro IS NULL OR tipo_lavoro = v_tipo_lavoro)
    ORDER BY work_end_date DESC LIMIT 5
  ) t;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id, 'case_studies', v_results);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_trova_case_studies_simili(uuid, uuid, numeric) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_analizza_proposal_engagement
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_proposal_engagement(
  p_company_id uuid,
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_p record;
BEGIN
  SELECT * INTO v_p FROM public.commercial_proposals
   WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_p IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'proposal_id', p_proposal_id,
    'sent_at', v_p.sent_at,
    'opened_at', v_p.opened_at,
    'opened', v_p.opened_at IS NOT NULL,
    'page_views', v_p.page_views,
    'time_to_open_hours',
      CASE WHEN v_p.sent_at IS NOT NULL AND v_p.opened_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (v_p.opened_at - v_p.sent_at))/3600.0
           ELSE NULL END,
    'outcome', v_p.outcome
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_proposal_engagement(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_invia_proposal_cliente
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_proposal_cliente(
  p_company_id uuid,
  p_proposal_id uuid,
  p_channels text[] DEFAULT ARRAY['email'],
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.commercial_proposals
     SET sent_at = now(),
         updated_at = now()
   WHERE id = p_proposal_id AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id, 'channels', p_channels, 'message_preview', left(COALESCE(p_message,''), 200));
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_invia_proposal_cliente(uuid, uuid, text[], text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-SALES-05 deployed: commercial_proposals + 4 RPC'; END $$;
