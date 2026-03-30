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
  VALUES (p_company_id, 'deduct', p_cost, v_balance_before, v_balance_after, p_description, p_campaign_id, p_metadata)
ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;
