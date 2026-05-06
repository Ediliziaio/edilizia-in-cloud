-- MP-SALES-04 — Dynamic Pricing Preventivi
-- ════════════════════════════════════════════════════════════════════════════
-- AI propone prezzi ottimali per voce computo basandosi su: storico margini,
-- benchmark mercato (Brain AEDIX), cliente (LTV/comportamento), stagionalità,
-- urgenza. Genera 3 varianti rapide (economy/standard/premium).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pricing_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id        uuid REFERENCES public.quotes(id) ON DELETE CASCADE,
  customer_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Identificatore voce computo (può non esistere ancora come riga)
  computo_line_id uuid,
  voce_descrizione text NOT NULL,
  qty             numeric(12,3),
  unita_misura    text,

  -- Costi reali storici
  cost_real_eur   numeric(12,2),

  -- Pricing references
  price_history_avg_eur numeric(12,2),
  price_history_samples int,
  market_avg_eur  numeric(12,2),
  market_p90_eur  numeric(12,2),

  -- AI suggestion
  suggested_price_eur   numeric(12,2),
  suggested_margin_pct  numeric(5,2),
  ai_reasoning          text,
  ai_confidence         numeric(3,2),

  -- 3 varianti (economy / standard / premium)
  economy_price_eur     numeric(12,2),
  standard_price_eur    numeric(12,2),
  premium_price_eur     numeric(12,2),

  -- Outcome tracking
  final_price_eur       numeric(12,2),
  final_variant_chosen  text CHECK (final_variant_chosen IN ('economy','standard','premium','custom')),
  accepted_by_customer  boolean,

  -- AI metadata
  ai_persona_used text NOT NULL DEFAULT 'sales',
  ai_cost_billed_eur numeric(10,4),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_quote
  ON public.pricing_suggestions(quote_id, created_at DESC) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_customer
  ON public.pricing_suggestions(customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_company_date
  ON public.pricing_suggestions(company_id, created_at DESC);

ALTER TABLE public.pricing_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_company_read ON public.pricing_suggestions;
CREATE POLICY pricing_company_read ON public.pricing_suggestions FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS pricing_admin ON public.pricing_suggestions;
CREATE POLICY pricing_admin ON public.pricing_suggestions FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS pricing_super_admin ON public.pricing_suggestions;
CREATE POLICY pricing_super_admin ON public.pricing_suggestions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Settings company
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS dynamic_pricing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_pricing_default_margin_pct numeric(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS dynamic_pricing_min_margin_pct numeric(5,2) NOT NULL DEFAULT 15;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_storico_pricing_voce (cerca prezzi storici per descrizione)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_storico_pricing_voce(
  p_company_id uuid,
  p_user_id uuid,
  p_voce_descrizione text,
  p_months_back int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Cerca pricing_suggestions storiche per descrizione simile (ILIKE)
  SELECT jsonb_build_object(
    'voce_query', p_voce_descrizione,
    'samples_count', COUNT(*),
    'avg_price_eur', ROUND(AVG(final_price_eur)::numeric, 2),
    'min_price_eur', MIN(final_price_eur),
    'max_price_eur', MAX(final_price_eur),
    'avg_margin_pct', ROUND(AVG(suggested_margin_pct)::numeric, 2),
    'recent_samples', COALESCE(jsonb_agg(
      jsonb_build_object(
        'voce', voce_descrizione,
        'price_eur', final_price_eur,
        'margin_pct', suggested_margin_pct,
        'variant', final_variant_chosen,
        'accepted', accepted_by_customer,
        'created_at', created_at
      ) ORDER BY created_at DESC
    ) FILTER (WHERE final_price_eur IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.pricing_suggestions
  WHERE company_id = p_company_id
    AND voce_descrizione ILIKE '%' || p_voce_descrizione || '%'
    AND created_at >= NOW() - (GREATEST(1, p_months_back) || ' months')::interval
    AND final_price_eur IS NOT NULL;

  RETURN COALESCE(v_result, jsonb_build_object('samples_count', 0, 'voce_query', p_voce_descrizione));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_storico_pricing_voce(uuid, uuid, text, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_storico_pricing_voce(uuid, uuid, text, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_suggerisci_prezzo_voce (con varianti economy/standard/premium)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_suggerisci_prezzo_voce(
  p_company_id uuid,
  p_user_id uuid,
  p_voce_descrizione text,
  p_qty numeric,
  p_unita_misura text,
  p_cost_real_eur numeric,
  p_customer_id uuid DEFAULT NULL,
  p_quote_id uuid DEFAULT NULL,
  p_ai_reasoning text DEFAULT NULL,
  p_ai_confidence numeric DEFAULT NULL,
  p_ai_cost_billed_eur numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_default_margin numeric;
  v_min_margin numeric;
  v_history_avg numeric;
  v_history_samples int;
  v_suggested_price numeric;
  v_suggested_margin numeric;
  v_economy numeric;
  v_premium numeric;
  v_id uuid;
BEGIN
  SELECT dynamic_pricing_default_margin_pct, dynamic_pricing_min_margin_pct INTO v_company
    FROM public.companies WHERE id = p_company_id;

  v_default_margin := COALESCE(v_company.dynamic_pricing_default_margin_pct, 25);
  v_min_margin := COALESCE(v_company.dynamic_pricing_min_margin_pct, 15);

  -- Storico voce simile (ILIKE descrizione)
  SELECT AVG(final_price_eur), COUNT(*) INTO v_history_avg, v_history_samples
    FROM public.pricing_suggestions
   WHERE company_id = p_company_id
     AND voce_descrizione ILIKE '%' || p_voce_descrizione || '%'
     AND final_price_eur IS NOT NULL
     AND created_at >= NOW() - INTERVAL '12 months';

  -- Suggested price = cost × (1 + default_margin)
  v_suggested_margin := v_default_margin;
  v_suggested_price := ROUND((p_cost_real_eur * p_qty * (1 + v_default_margin / 100))::numeric, 2);

  -- Varianti
  v_economy := ROUND((p_cost_real_eur * p_qty * (1 + v_min_margin / 100))::numeric, 2);
  v_premium := ROUND((p_cost_real_eur * p_qty * (1 + (v_default_margin + 20) / 100))::numeric, 2);

  -- Insert suggestion record per audit + storico futuro
  INSERT INTO public.pricing_suggestions (
    company_id, quote_id, customer_id,
    voce_descrizione, qty, unita_misura,
    cost_real_eur,
    price_history_avg_eur, price_history_samples,
    suggested_price_eur, suggested_margin_pct,
    economy_price_eur, standard_price_eur, premium_price_eur,
    ai_reasoning, ai_confidence, ai_cost_billed_eur
  ) VALUES (
    p_company_id, p_quote_id, p_customer_id,
    p_voce_descrizione, p_qty, p_unita_misura,
    p_cost_real_eur,
    v_history_avg, v_history_samples,
    v_suggested_price, v_suggested_margin,
    v_economy, v_suggested_price, v_premium,
    p_ai_reasoning, p_ai_confidence, p_ai_cost_billed_eur
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'suggestion_id', v_id,
    'voce_descrizione', p_voce_descrizione,
    'qty', p_qty,
    'cost_real_eur', p_cost_real_eur,
    'suggested_price_eur', v_suggested_price,
    'suggested_margin_pct', v_suggested_margin,
    'variants', jsonb_build_object(
      'economy', jsonb_build_object('price_eur', v_economy, 'margin_pct', v_min_margin),
      'standard', jsonb_build_object('price_eur', v_suggested_price, 'margin_pct', v_default_margin),
      'premium', jsonb_build_object('price_eur', v_premium, 'margin_pct', v_default_margin + 20)
    ),
    'history', jsonb_build_object(
      'avg_eur', v_history_avg,
      'samples', v_history_samples
    ),
    'ai_reasoning', p_ai_reasoning
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_suggerisci_prezzo_voce(uuid, uuid, text, numeric, text, numeric, uuid, uuid, text, numeric, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_suggerisci_prezzo_voce(uuid, uuid, text, numeric, text, numeric, uuid, uuid, text, numeric, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_simula_what_if_pricing
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_simula_what_if_pricing(
  p_company_id uuid,
  p_user_id uuid,
  p_quote_id uuid,
  p_margin_change_pct numeric
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cost numeric;
  v_current_total numeric;
  v_simulated_total numeric;
  v_current_margin_pct numeric;
  v_new_margin_pct numeric;
BEGIN
  SELECT
    SUM(cost_real_eur * COALESCE(qty, 1)),
    SUM(suggested_price_eur)
  INTO v_total_cost, v_current_total
  FROM public.pricing_suggestions
  WHERE quote_id = p_quote_id
    AND company_id = p_company_id;

  IF v_total_cost IS NULL OR v_total_cost = 0 THEN
    RETURN jsonb_build_object('error', 'Nessuna pricing_suggestion per questo quote');
  END IF;

  v_current_margin_pct := ROUND(((v_current_total - v_total_cost) / v_total_cost * 100)::numeric, 2);
  v_new_margin_pct := v_current_margin_pct + p_margin_change_pct;
  v_simulated_total := ROUND((v_total_cost * (1 + v_new_margin_pct / 100))::numeric, 2);

  RETURN jsonb_build_object(
    'quote_id', p_quote_id,
    'total_cost_eur', v_total_cost,
    'current_total_eur', v_current_total,
    'current_margin_pct', v_current_margin_pct,
    'simulated_total_eur', v_simulated_total,
    'simulated_margin_pct', v_new_margin_pct,
    'delta_eur', v_simulated_total - v_current_total,
    'delta_pct', p_margin_change_pct
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_simula_what_if_pricing(uuid, uuid, uuid, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_simula_what_if_pricing(uuid, uuid, uuid, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_analizza_storico_pricing_cliente
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_storico_pricing_cliente(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'customer_id', p_customer_id,
    'total_quotes', COUNT(DISTINCT quote_id),
    'total_suggestions', COUNT(*),
    'avg_margin_chosen_pct', ROUND(AVG(suggested_margin_pct) FILTER (WHERE final_variant_chosen IS NOT NULL)::numeric, 2),
    'variant_breakdown', jsonb_build_object(
      'economy', COUNT(*) FILTER (WHERE final_variant_chosen = 'economy'),
      'standard', COUNT(*) FILTER (WHERE final_variant_chosen = 'standard'),
      'premium', COUNT(*) FILTER (WHERE final_variant_chosen = 'premium'),
      'custom', COUNT(*) FILTER (WHERE final_variant_chosen = 'custom')
    ),
    'acceptance_rate', ROUND(
      (100.0 * COUNT(*) FILTER (WHERE accepted_by_customer = true) /
       NULLIF(COUNT(*) FILTER (WHERE accepted_by_customer IS NOT NULL), 0))::numeric,
      1
    ),
    'recommendation', CASE
      WHEN COUNT(*) FILTER (WHERE final_variant_chosen = 'economy') > COUNT(*) FILTER (WHERE final_variant_chosen IN ('standard','premium'))
        THEN 'cliente price-sensitive: proponi economy/standard'
      WHEN COUNT(*) FILTER (WHERE final_variant_chosen = 'premium') > 0
        THEN 'cliente value-oriented: proponi premium con servizi extra'
      ELSE 'cliente standard: proporre tier medio'
    END
  ) INTO v_result
  FROM public.pricing_suggestions
  WHERE company_id = p_company_id
    AND customer_id = p_customer_id
    AND created_at >= NOW() - INTERVAL '24 months';

  RETURN COALESCE(v_result, jsonb_build_object('customer_id', p_customer_id, 'total_suggestions', 0));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_analizza_storico_pricing_cliente(uuid, uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_storico_pricing_cliente(uuid, uuid, uuid)
  TO service_role;
