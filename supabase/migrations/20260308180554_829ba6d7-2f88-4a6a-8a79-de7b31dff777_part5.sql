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
    VALUES (p_company_id, CASE WHEN p_amount >= 0 THEN 'topup' ELSE 'deduction' END, p_amount, v_balance_before, v_balance_after, 'Admin: ' || p_reason)
ON CONFLICT DO NOTHING;

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
    VALUES (p_company_id, CASE WHEN p_amount >= 0 THEN 'topup' ELSE 'deduction' END, p_amount, v_balance_before, v_balance_after, 'Admin: ' || p_reason)
ON CONFLICT DO NOTHING;

  ELSE
    RETURN jsonb_build_object('error', 'Servizio non supportato: ' || p_service);
  END IF;

  INSERT INTO public.admin_credit_adjustments (company_id, service, amount_eur, reason, created_by)
  VALUES (p_company_id, p_service, p_amount, p_reason, p_adjusted_by)
ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after, 'success', true);
END;
$$;
