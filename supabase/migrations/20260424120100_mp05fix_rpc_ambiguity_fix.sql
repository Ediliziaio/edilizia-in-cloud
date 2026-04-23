-- MP05-FIX hotfix — Risolve ambiguità column/variable nelle RETURN TABLE
-- delle RPC billing (balance_eur, est_cost_eur). Prefisso o_ sui nomi OUT.

BEGIN;

DROP FUNCTION IF EXISTS public.check_ai_credits_available(UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.check_ai_credits_available(
  p_company_id    UUID,
  p_est_cost_usd  NUMERIC DEFAULT 0.001,
  p_task_kind     TEXT DEFAULT 'default'
)
RETURNS TABLE (
  o_ok              BOOLEAN,
  o_reason          TEXT,
  o_balance_eur     NUMERIC,
  o_est_cost_eur    NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate      NUMERIC;
  v_markup    NUMERIC;
  v_min       NUMERIC;
  v_balance   NUMERIC;
  v_blocked   BOOLEAN;
  v_est_eur   NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings ps WHERE ps.key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.05) INTO v_min
  FROM public.platform_settings ps WHERE ps.key = 'ai_min_balance_eur_to_call';
  IF v_min IS NULL THEN v_min := 0.05; END IF;

  SELECT pm.markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup pm
  WHERE pm.task_kind = p_task_kind AND pm.enabled = true;
  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default' AND pm.enabled = true;
  END IF;
  IF v_markup IS NULL THEN v_markup := 3.00; END IF;

  SELECT ac.balance_eur, ac.calls_blocked INTO v_balance, v_blocked
  FROM public.ai_credits ac WHERE ac.company_id = p_company_id;

  IF v_balance IS NULL THEN v_balance := 0; v_blocked := false; END IF;

  v_est_eur := COALESCE(p_est_cost_usd, 0) * v_rate * v_markup;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_min THEN
    RETURN QUERY SELECT false, 'below_minimum'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_est_eur THEN
    RETURN QUERY SELECT false, 'insufficient'::TEXT, v_balance, v_est_eur;
  ELSE
    RETURN QUERY SELECT true, 'ok'::TEXT, v_balance, v_est_eur;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT) TO service_role;

COMMIT;
