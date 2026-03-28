-- 5. RPC consume_ai_credits (atomic, uses bonus first)
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_company_id uuid,
  p_amount numeric,
  p_descrizione text DEFAULT 'Consumo agente AI',
  p_agent_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric;
  v_crediti numeric;
  v_from_bonus numeric;
  v_from_crediti numeric;
  v_remaining numeric;
  v_saldo_prima numeric;
  v_saldo_dopo numeric;
BEGIN
  -- Lock the row
  SELECT ai_crediti, ai_crediti_bonus INTO v_crediti, v_bonus
  FROM companies WHERE id = p_company_id FOR UPDATE;

  IF v_crediti IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_saldo_prima := COALESCE(v_crediti, 0) + COALESCE(v_bonus, 0);
  v_remaining := p_amount;

  -- Deduct from bonus first
  IF COALESCE(v_bonus, 0) > 0 THEN
    v_from_bonus := LEAST(v_bonus, v_remaining);
    v_remaining := v_remaining - v_from_bonus;
  ELSE
    v_from_bonus := 0;
  END IF;

  -- Then from crediti
  v_from_crediti := v_remaining;

  -- Check sufficient balance
  IF (COALESCE(v_crediti, 0) - v_from_crediti) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'saldo', v_saldo_prima);
  END IF;

  -- Update
  UPDATE companies SET
    ai_crediti = COALESCE(ai_crediti, 0) - v_from_crediti,
    ai_crediti_bonus = COALESCE(ai_crediti_bonus, 0) - v_from_bonus
  WHERE id = p_company_id;

  v_saldo_dopo := v_saldo_prima - p_amount;

  -- Log transaction
  INSERT INTO ai_credit_transactions (company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, agent_id, conversation_id)
  VALUES (p_company_id, 'consumo', -p_amount, v_saldo_prima, v_saldo_dopo, p_descrizione, p_agent_id, p_conversation_id);

  RETURN jsonb_build_object('success', true, 'saldo_dopo', v_saldo_dopo, 'scalato_bonus', v_from_bonus, 'scalato_crediti', v_from_crediti);
END;
$$;
