
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(p_company_id uuid, p_cost numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  -- Get current balance
  SELECT balance_eur INTO v_balance_before
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE; -- Row-level lock prevents concurrent reads

  IF v_balance_before IS NULL THEN
    -- Auto-create wallet with negative balance
    INSERT INTO public.ai_credits (company_id, balance_eur, total_spent_eur)
    VALUES (p_company_id, -p_cost, p_cost)
    ON CONFLICT (company_id) DO UPDATE
    SET balance_eur = ai_credits.balance_eur - p_cost,
        total_spent_eur = COALESCE(ai_credits.total_spent_eur, 0) + p_cost,
        updated_at = now()
    RETURNING balance_eur INTO v_balance_after;

    v_balance_before := 0;
  ELSE
    -- Atomic deduction with row lock already held
    UPDATE public.ai_credits
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
