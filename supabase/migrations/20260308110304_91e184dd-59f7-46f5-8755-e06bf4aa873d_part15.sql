-- 8. Add credits helper (topup with logging)
DROP FUNCTION IF EXISTS public.add_email_credits_with_log(uuid, numeric, text, text, jsonb) CASCADE;
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
  VALUES (p_company_id, p_type, p_amount, v_balance_before, v_balance_after, p_description, p_metadata)
ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;
