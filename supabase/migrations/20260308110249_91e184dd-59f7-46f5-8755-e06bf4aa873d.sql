
-- 1. email_credits_log — storico movimenti crediti email
CREATE TABLE IF NOT EXISTS public.email_credits_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'deduct',
  amount_eur numeric NOT NULL DEFAULT 0,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  description text,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_credits_log_company ON public.email_credits_log(company_id);
CREATE INDEX idx_email_credits_log_created ON public.email_credits_log(created_at DESC);

ALTER TABLE public.email_credits_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read own company email credits log"
  ON public.email_credits_log FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2. company_auto_topup
CREATE TABLE IF NOT EXISTS public.company_auto_topup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wallet_type text NOT NULL DEFAULT 'email',
  enabled boolean NOT NULL DEFAULT false,
  threshold_eur numeric NOT NULL DEFAULT 5.00,
  topup_amount_eur numeric NOT NULL DEFAULT 20.00,
  payment_method text DEFAULT 'stripe',
  stripe_payment_method_id text,
  last_topup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, wallet_type)
);

CREATE INDEX idx_company_auto_topup_company ON public.company_auto_topup(company_id);

ALTER TABLE public.company_auto_topup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage own company auto topup"
  ON public.company_auto_topup FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. Add columns to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS segment_json jsonb,
  ADD COLUMN IF NOT EXISTS credits_used numeric NOT NULL DEFAULT 0;

-- 4. Add unsubscribed columns to marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS unsubscribed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

CREATE INDEX idx_marketing_contacts_unsubscribed ON public.marketing_contacts(company_id) WHERE unsubscribed = false;

-- 5. Add provider-agnostic columns to email_logs
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS stream text DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

-- 6. RPC: get_platform_email_stats
CREATE OR REPLACE FUNCTION public.get_platform_email_stats(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  total_sent bigint,
  total_delivered bigint,
  total_opened bigint,
  total_clicked bigint,
  total_bounced bigint,
  total_unsubscribed bigint,
  total_spam bigint,
  total_credits_used numeric,
  total_revenue numeric,
  active_companies bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint,
    COALESCE((SELECT SUM(ec2.credits_used) FROM public.email_campaigns ec2
      WHERE (p_date_from IS NULL OR ec2.sent_at >= p_date_from)
      AND (p_date_to IS NULL OR ec2.sent_at <= p_date_to)), 0)::numeric,
    COALESCE((SELECT SUM(ecr.total_spent_eur) FROM public.email_credits ecr), 0)::numeric,
    COUNT(DISTINCT el.company_id)::bigint
  FROM public.email_logs el
  WHERE (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
$$;

-- 7. Enhanced deduct with logging
CREATE OR REPLACE FUNCTION public.deduct_email_credits_with_log(
  p_company_id uuid,
  p_cost numeric,
  p_description text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT balance_eur INTO v_balance_before
  FROM public.email_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    INSERT INTO public.email_credits (company_id, balance_eur, total_spent_eur)
    VALUES (p_company_id, -p_cost, p_cost)
    ON CONFLICT (company_id) DO UPDATE
    SET balance_eur = email_credits.balance_eur - p_cost,
        total_spent_eur = COALESCE(email_credits.total_spent_eur, 0) + p_cost,
        updated_at = now()
    RETURNING balance_eur INTO v_balance_after;
    v_balance_before := 0;
  ELSE
    UPDATE public.email_credits
    SET balance_eur = balance_eur - p_cost,
        total_spent_eur = COALESCE(total_spent_eur, 0) + p_cost,
        updated_at = now()
    WHERE company_id = p_company_id
    RETURNING balance_eur INTO v_balance_after;
  END IF;

  INSERT INTO public.email_credits_log (company_id, type, amount_eur, balance_before, balance_after, description, campaign_id, metadata)
  VALUES (p_company_id, 'deduct', p_cost, v_balance_before, v_balance_after, p_description, p_campaign_id, p_metadata);

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;

-- 8. Add credits helper (topup with logging)
CREATE OR REPLACE FUNCTION public.add_email_credits_with_log(
  p_company_id uuid,
  p_amount numeric,
  p_type text DEFAULT 'topup',
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT balance_eur INTO v_balance_before
  FROM public.email_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    INSERT INTO public.email_credits (company_id, balance_eur, total_recharged_eur)
    VALUES (p_company_id, p_amount, p_amount)
    ON CONFLICT (company_id) DO UPDATE
    SET balance_eur = email_credits.balance_eur + p_amount,
        total_recharged_eur = COALESCE(email_credits.total_recharged_eur, 0) + p_amount,
        updated_at = now()
    RETURNING balance_eur INTO v_balance_after;
    v_balance_before := 0;
  ELSE
    UPDATE public.email_credits
    SET balance_eur = balance_eur + p_amount,
        total_recharged_eur = COALESCE(total_recharged_eur, 0) + p_amount,
        updated_at = now()
    WHERE company_id = p_company_id
    RETURNING balance_eur INTO v_balance_after;
  END IF;

  INSERT INTO public.email_credits_log (company_id, type, amount_eur, balance_before, balance_after, description, metadata)
  VALUES (p_company_id, p_type, p_amount, v_balance_before, v_balance_after, p_description, p_metadata);

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;
