
-- Fix: whatsapp_credits_log RLS (INSERT uses WITH CHECK only, no USING)
CREATE TABLE IF NOT EXISTS public.whatsapp_credits_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'deduction',
  amount_eur numeric NOT NULL,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  description text DEFAULT NULL,
  broadcast_id uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_credits_log ENABLE ROW LEVEL SECURITY;

-- SELECT for company members
CREATE POLICY "Company members can read own whatsapp_credits_log"
  ON public.whatsapp_credits_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- INSERT for service (via edge functions with service role, so no user-facing insert policy needed)
-- Super admin full access for SELECT/UPDATE/DELETE
CREATE POLICY "Super admin manage whatsapp_credits_log"
  ON public.whatsapp_credits_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_whatsapp_credits_log_company ON public.whatsapp_credits_log(company_id);

-- RPC: adjust_credits_atomic
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
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  IF p_service = 'email' THEN
    SELECT balance_eur INTO v_balance_before FROM public.email_credits WHERE company_id = p_company_id FOR UPDATE;
    IF v_balance_before IS NULL THEN
      INSERT INTO public.email_credits (company_id, balance_eur) VALUES (p_company_id, p_amount)
      ON CONFLICT (company_id) DO UPDATE SET balance_eur = email_credits.balance_eur + p_amount, updated_at = now();
      v_balance_before := 0;
      v_balance_after := p_amount;
    ELSE
      v_balance_after := v_balance_before + p_amount;
      UPDATE public.email_credits SET balance_eur = v_balance_after, updated_at = now() WHERE company_id = p_company_id;
    END IF;
    INSERT INTO public.email_credits_log (company_id, type, amount_eur, balance_before, balance_after, description)
    VALUES (p_company_id, CASE WHEN p_amount >= 0 THEN 'topup' ELSE 'deduction' END, p_amount, v_balance_before, v_balance_after, 'Admin: ' || p_reason);

  ELSIF p_service = 'ai_agents' THEN
    SELECT balance_eur INTO v_balance_before FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;
    IF v_balance_before IS NULL THEN
      INSERT INTO public.ai_credits (company_id, balance_eur) VALUES (p_company_id, p_amount)
      ON CONFLICT (company_id) DO UPDATE SET balance_eur = ai_credits.balance_eur + p_amount, updated_at = now();
      v_balance_before := 0;
      v_balance_after := p_amount;
    ELSE
      v_balance_after := v_balance_before + p_amount;
      UPDATE public.ai_credits SET balance_eur = v_balance_after, updated_at = now(), calls_blocked = CASE WHEN v_balance_after > 0 THEN false ELSE calls_blocked END WHERE company_id = p_company_id;
    END IF;

  ELSIF p_service = 'whatsapp' THEN
    SELECT balance_eur INTO v_balance_before FROM public.whatsapp_credits WHERE company_id = p_company_id FOR UPDATE;
    IF v_balance_before IS NULL THEN
      INSERT INTO public.whatsapp_credits (company_id, balance_eur) VALUES (p_company_id, p_amount)
      ON CONFLICT (company_id) DO UPDATE SET balance_eur = whatsapp_credits.balance_eur + p_amount, updated_at = now();
      v_balance_before := 0;
      v_balance_after := p_amount;
    ELSE
      v_balance_after := v_balance_before + p_amount;
      UPDATE public.whatsapp_credits SET balance_eur = v_balance_after, updated_at = now(), sends_blocked = CASE WHEN v_balance_after > 0 THEN false ELSE sends_blocked END WHERE company_id = p_company_id;
    END IF;
    INSERT INTO public.whatsapp_credits_log (company_id, type, amount_eur, balance_before, balance_after, description)
    VALUES (p_company_id, CASE WHEN p_amount >= 0 THEN 'topup' ELSE 'deduction' END, p_amount, v_balance_before, v_balance_after, 'Admin: ' || p_reason);

  ELSE
    RETURN jsonb_build_object('error', 'Servizio non supportato: ' || p_service);
  END IF;

  INSERT INTO public.admin_credit_adjustments (company_id, service, amount_eur, reason, created_by)
  VALUES (p_company_id, p_service, p_amount, p_reason, p_adjusted_by);

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after, 'success', true);
END;
$$;

-- Platform setting
INSERT INTO public.platform_settings (key, value)
VALUES ('whatsapp_price_per_msg_eur', '0.0006')
ON CONFLICT (key) DO NOTHING;
