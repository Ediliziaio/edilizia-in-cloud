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
