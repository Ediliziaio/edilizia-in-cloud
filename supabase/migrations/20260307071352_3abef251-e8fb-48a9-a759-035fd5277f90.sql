
-- email_credits: wallet per azienda (come ai_credits)
CREATE TABLE public.email_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_eur NUMERIC NOT NULL DEFAULT 0,
  total_spent_eur NUMERIC NOT NULL DEFAULT 0,
  total_recharged_eur NUMERIC NOT NULL DEFAULT 0,
  sends_blocked BOOLEAN NOT NULL DEFAULT false,
  auto_recharge_enabled BOOLEAN DEFAULT false,
  auto_recharge_threshold NUMERIC DEFAULT 1,
  auto_recharge_amount NUMERIC DEFAULT 10,
  alert_threshold_eur NUMERIC DEFAULT 2,
  alert_email_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.email_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on email_credits"
  ON public.email_credits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Company members can view own email_credits"
  ON public.email_credits FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- email_pricing: configurazione super admin
CREATE TABLE public.email_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'sendgrid',
  label TEXT,
  cost_real_per_email NUMERIC NOT NULL DEFAULT 0.0001,
  cost_billed_per_email NUMERIC NOT NULL DEFAULT 0.0003,
  markup_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on email_pricing"
  ON public.email_pricing FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Authenticated can read active email_pricing"
  ON public.email_pricing FOR SELECT TO authenticated
  USING (is_active = true);

-- Funzione atomica deduct_email_credits (stile deduct_ai_credits)
CREATE OR REPLACE FUNCTION public.deduct_email_credits(p_company_id UUID, p_cost NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance_before NUMERIC;
  v_balance_after NUMERIC;
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

  RETURN jsonb_build_object(
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
END;
$$;

-- Trigger per inizializzare email_credits quando si crea una company
CREATE OR REPLACE FUNCTION public.init_company_email_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.email_credits (company_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_init_email_credits
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.init_company_email_credits();

-- Seed default pricing row
INSERT INTO public.email_pricing (provider, label, cost_real_per_email, cost_billed_per_email, markup_multiplier)
VALUES ('sendgrid', 'SendGrid Standard', 0.0001, 0.0003, 3.0);
