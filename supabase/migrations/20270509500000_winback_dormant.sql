-- MP-SALES-03 — Win-back Clienti Dormienti
-- ════════════════════════════════════════════════════════════════════════════
-- Riattivazione automatica clienti con offerte personalizzate basate su:
-- storico ordini, vertical company, stagionalità, prodotti complementari.
--
-- Defensive: customer è in profiles (non `customers`) → FK a profiles.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.winback_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Triggering
  identified_at   timestamptz NOT NULL DEFAULT NOW(),
  dormancy_days   int NOT NULL,
  dormancy_score  numeric(5,2),
  customer_ltv_eur     numeric(12,2),
  customer_orders_count int,

  -- AI generated offer
  ai_analysis        text,
  ai_offer_summary   text,
  offered_products   jsonb,
  ai_message         text,
  ai_persona_used    text NOT NULL DEFAULT 'sales',
  ai_cost_billed_eur numeric(10,4),

  -- HITL state machine
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','approved_pending','rejected','sent','responded',
    'converted','no_response','do_not_contact'
  )),
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,

  -- Send
  channel         text CHECK (channel IN ('email','whatsapp','sms','phone_call','letter','telegram')),
  sent_at         timestamptz,
  external_message_id text,

  -- Outcome
  customer_replied       boolean NOT NULL DEFAULT false,
  replied_at             timestamptz,
  customer_response_text text,
  resulted_in_quote_id   uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  resulted_in_order_id   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  conversion_value_eur   numeric(12,2),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_company_status
  ON public.winback_campaigns(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_winback_customer
  ON public.winback_campaigns(customer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_winback_pending_review
  ON public.winback_campaigns(created_at DESC) WHERE status = 'draft';

ALTER TABLE public.winback_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS winback_company_read ON public.winback_campaigns;
CREATE POLICY winback_company_read ON public.winback_campaigns FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS winback_admin ON public.winback_campaigns;
CREATE POLICY winback_admin ON public.winback_campaigns FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS winback_super_admin ON public.winback_campaigns;
CREATE POLICY winback_super_admin ON public.winback_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_winback_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_winback_updated_at ON public.winback_campaigns;
CREATE TRIGGER trg_winback_updated_at
  BEFORE UPDATE ON public.winback_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_winback_updated_at();

-- Settings company
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS winback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS winback_dormancy_threshold_days int NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS winback_max_per_week int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS winback_require_hitl boolean NOT NULL DEFAULT true;

-- Settings customer (opt-out compliant GDPR)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS winback_opt_out boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_identify_dormant_customers
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_identify_dormant_customers(
  p_company_id uuid,
  p_user_id uuid,
  p_threshold_days int DEFAULT 180,
  p_top_n int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_threshold int := GREATEST(30, LEAST(730, p_threshold_days));
  v_top int := GREATEST(1, LEAST(200, p_top_n));
BEGIN
  WITH cust_stats AS (
    SELECT
      o.customer_id,
      MAX(o.created_at) AS last_order_at,
      COUNT(o.id) AS orders_count,
      COALESCE(SUM(o.total_amount), 0) AS total_ltv_eur,
      EXTRACT(DAY FROM NOW() - MAX(o.created_at))::int AS days_since_last
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND o.customer_id IS NOT NULL
    GROUP BY o.customer_id
  ),
  no_recent_winback AS (
    SELECT DISTINCT customer_id FROM public.winback_campaigns
     WHERE company_id = p_company_id
       AND created_at >= NOW() - INTERVAL '60 days'
  ),
  ranked AS (
    SELECT
      cs.customer_id,
      cs.last_order_at,
      cs.orders_count,
      cs.total_ltv_eur,
      cs.days_since_last,
      ROUND((
        LEAST(100, cs.total_ltv_eur / 100.0)
        + LEAST(30, cs.orders_count * 5)
        + GREATEST(0, 50 - (cs.days_since_last - v_threshold) * 0.2)
      )::numeric, 2) AS dormancy_score
    FROM cust_stats cs
    JOIN public.profiles p ON p.id = cs.customer_id
    WHERE cs.days_since_last >= v_threshold
      AND COALESCE(p.winback_opt_out, false) = false
      AND cs.customer_id NOT IN (SELECT customer_id FROM no_recent_winback)
    ORDER BY cs.total_ltv_eur DESC, cs.orders_count DESC
    LIMIT v_top
  )
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'dormant_customers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'customer_id', r.customer_id,
        'full_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
        'email', p.email,
        'phone', p.phone,
        'last_order_at', r.last_order_at,
        'days_since_last', r.days_since_last,
        'orders_count', r.orders_count,
        'total_ltv_eur', r.total_ltv_eur,
        'dormancy_score', r.dormancy_score
      ) ORDER BY r.dormancy_score DESC
    ) FILTER (WHERE r.customer_id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM ranked r
  JOIN public.profiles p ON p.id = r.customer_id;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'dormant_customers', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_identify_dormant_customers(uuid, uuid, int, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_identify_dormant_customers(uuid, uuid, int, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_crea_winback_draft
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_crea_winback_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid,
  p_dormancy_days int,
  p_dormancy_score numeric,
  p_customer_ltv_eur numeric,
  p_customer_orders_count int,
  p_ai_analysis text,
  p_ai_offer_summary text,
  p_offered_products jsonb,
  p_ai_message text,
  p_ai_cost_billed_eur numeric DEFAULT NULL,
  p_channel text DEFAULT 'email'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_opt_out boolean;
BEGIN
  -- Check opt-out cliente (compliance GDPR)
  SELECT COALESCE(winback_opt_out, false) INTO v_opt_out
    FROM public.profiles WHERE id = p_customer_id;

  IF v_opt_out THEN
    RETURN jsonb_build_object('error', 'Cliente ha opt-out winback', 'skipped', true);
  END IF;

  INSERT INTO public.winback_campaigns (
    company_id, customer_id, dormancy_days, dormancy_score,
    customer_ltv_eur, customer_orders_count,
    ai_analysis, ai_offer_summary, offered_products, ai_message,
    ai_cost_billed_eur, channel, status
  ) VALUES (
    p_company_id, p_customer_id, p_dormancy_days, p_dormancy_score,
    p_customer_ltv_eur, p_customer_orders_count,
    p_ai_analysis, p_ai_offer_summary, p_offered_products, p_ai_message,
    p_ai_cost_billed_eur, p_channel, 'draft'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', v_id,
    'message', 'Bozza winback creata. Richiede review prima dell''invio.'
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_crea_winback_draft(uuid, uuid, uuid, int, numeric, numeric, int, text, text, jsonb, text, numeric, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_winback_draft(uuid, uuid, uuid, int, numeric, numeric, int, text, text, jsonb, text, numeric, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_winback_campaigns
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_winback_campaigns(
  p_company_id uuid,
  p_user_id uuid,
  p_status_filter text DEFAULT NULL
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
    'count_draft', COUNT(*) FILTER (WHERE status = 'draft'),
    'count_sent', COUNT(*) FILTER (WHERE status IN ('sent','responded')),
    'count_converted', COUNT(*) FILTER (WHERE status = 'converted'),
    'campaigns', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', wc.id,
        'customer_id', wc.customer_id,
        'customer_name', COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
        'dormancy_days', wc.dormancy_days,
        'dormancy_score', wc.dormancy_score,
        'customer_ltv_eur', wc.customer_ltv_eur,
        'ai_offer_summary', wc.ai_offer_summary,
        'status', wc.status,
        'channel', wc.channel,
        'sent_at', wc.sent_at,
        'customer_replied', wc.customer_replied,
        'conversion_value_eur', wc.conversion_value_eur,
        'created_at', wc.created_at
      ) ORDER BY wc.created_at DESC
    ) FILTER (WHERE wc.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.winback_campaigns wc
  LEFT JOIN public.profiles p ON p.id = wc.customer_id
  WHERE wc.company_id = p_company_id
    AND (p_status_filter IS NULL OR wc.status = p_status_filter);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'campaigns', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_winback_campaigns(uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_winback_campaigns(uuid, uuid, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_opt_out_winback (GDPR — cliente fa unsubscribe)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_opt_out_winback(
  p_user_id uuid,
  p_customer_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET winback_opt_out = true
   WHERE id = p_customer_id;

  -- Marca tutti i winback pending come do_not_contact
  UPDATE public.winback_campaigns
     SET status = 'do_not_contact',
         updated_at = NOW()
   WHERE customer_id = p_customer_id
     AND status IN ('draft','approved_pending');

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'reason', p_reason,
    'message', 'Opt-out registrato. Cliente non riceverà più win-back.'
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_opt_out_winback(uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_opt_out_winback(uuid, uuid, text)
  TO authenticated, service_role;
