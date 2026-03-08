
-- 1. company_billing_overrides
CREATE TABLE public.company_billing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('email', 'ai_agents', 'whatsapp', 'sms', 'phone_numbers')),
  is_enabled boolean NOT NULL DEFAULT true,
  is_free boolean NOT NULL DEFAULT false,
  price_per_unit_eur numeric(10,4),
  markup_multiplier numeric(6,2),
  monthly_fee_eur numeric(10,2),
  custom_notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, service)
);

CREATE INDEX idx_billing_overrides_company ON public.company_billing_overrides(company_id);

ALTER TABLE public.company_billing_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON public.company_billing_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. admin_credit_adjustments
CREATE TABLE public.admin_credit_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('email', 'ai_agents', 'whatsapp')),
  amount_eur numeric(12,4) NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_adjustments_company ON public.admin_credit_adjustments(company_id);

ALTER TABLE public.admin_credit_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON public.admin_credit_adjustments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. whatsapp_credits
CREATE TABLE public.whatsapp_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  balance_eur numeric(12,4) NOT NULL DEFAULT 0,
  total_spent_eur numeric(12,4) NOT NULL DEFAULT 0,
  total_recharged_eur numeric(12,4) NOT NULL DEFAULT 0,
  sends_blocked boolean NOT NULL DEFAULT false,
  auto_recharge_enabled boolean NOT NULL DEFAULT false,
  auto_recharge_threshold numeric(10,2) DEFAULT 5,
  auto_recharge_amount numeric(10,2) DEFAULT 20,
  alert_threshold_eur numeric(10,2),
  alert_email_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_credits ENABLE ROW LEVEL SECURITY;

-- Company members can read their own
CREATE POLICY "company_read" ON public.whatsapp_credits
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Super admin full access
CREATE POLICY "super_admin_write" ON public.whatsapp_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 4. RPC: adjust_credits_atomic
CREATE OR REPLACE FUNCTION public.adjust_credits_atomic(
  p_company_id uuid,
  p_service text,
  p_amount numeric,
  p_reason text,
  p_adjusted_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before numeric;
  v_after numeric;
BEGIN
  -- Validate service
  IF p_service NOT IN ('email', 'ai_agents', 'whatsapp') THEN
    RETURN jsonb_build_object('error', 'Servizio non valido: ' || p_service);
  END IF;

  -- Adjust based on service
  CASE p_service
    WHEN 'email' THEN
      SELECT balance_eur INTO v_before FROM public.email_credits WHERE company_id = p_company_id FOR UPDATE;
      IF v_before IS NULL THEN
        INSERT INTO public.email_credits (company_id, balance_eur) VALUES (p_company_id, p_amount);
        v_before := 0;
        v_after := p_amount;
      ELSE
        UPDATE public.email_credits SET balance_eur = balance_eur + p_amount, updated_at = now() WHERE company_id = p_company_id RETURNING balance_eur INTO v_after;
      END IF;

    WHEN 'ai_agents' THEN
      SELECT balance_eur INTO v_before FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;
      IF v_before IS NULL THEN
        INSERT INTO public.ai_credits (company_id, balance_eur) VALUES (p_company_id, p_amount);
        v_before := 0;
        v_after := p_amount;
      ELSE
        UPDATE public.ai_credits SET balance_eur = balance_eur + p_amount, updated_at = now() WHERE company_id = p_company_id RETURNING balance_eur INTO v_after;
      END IF;

    WHEN 'whatsapp' THEN
      SELECT balance_eur INTO v_before FROM public.whatsapp_credits WHERE company_id = p_company_id FOR UPDATE;
      IF v_before IS NULL THEN
        INSERT INTO public.whatsapp_credits (company_id, balance_eur) VALUES (p_company_id, p_amount);
        v_before := 0;
        v_after := p_amount;
      ELSE
        UPDATE public.whatsapp_credits SET balance_eur = balance_eur + p_amount, updated_at = now() WHERE company_id = p_company_id RETURNING balance_eur INTO v_after;
      END IF;
  END CASE;

  -- Log the adjustment
  INSERT INTO public.admin_credit_adjustments (company_id, service, amount_eur, reason, created_by)
  VALUES (p_company_id, p_service, p_amount, p_reason, p_adjusted_by);

  RETURN jsonb_build_object('success', true, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;
