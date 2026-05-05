-- AI tokenless billing fix
-- Some AI providers bill by seconds/images/jobs instead of tokens. The previous
-- charge_ai_call implementation stored real cost but billed 0 EUR when
-- tokens_in=tokens_out=0. Keep token pricing unchanged, but bill tokenless
-- successful calls from real cost + configured markup.

CREATE OR REPLACE FUNCTION public.charge_ai_call(
  p_idempotency_key text,
  p_company_id      uuid,
  p_user_id         uuid,
  p_task_key        text,
  p_tier_key        text,
  p_model_used      text,
  p_used_primary    boolean,
  p_fallback_index  int,
  p_persona_key     text,
  p_tokens_in       int,
  p_tokens_out      int,
  p_cost_real_usd   numeric,
  p_fx_usd_to_eur   numeric,
  p_status          text DEFAULT 'success',
  p_error_message   text DEFAULT NULL,
  p_duration_ms     int DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pricing       jsonb;
  v_cost_real_eur numeric;
  v_cost_billed_eur numeric;
  v_balance_after numeric;
  v_existing_id   uuid;
  v_ledger_id     uuid;
  v_markup_pct    numeric;
  v_override_id   uuid;
  v_period_start  date;
  v_tokens_total  int;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key obbligatoria (min 8 char)' USING ERRCODE = '22023';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('success', 'error', 'timeout') THEN
    RAISE EXCEPTION 'status non valido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_cost_real_usd < 0 THEN
    RAISE EXCEPTION 'cost_real_usd non può essere negativo' USING ERRCODE = '22023';
  END IF;
  IF p_fx_usd_to_eur <= 0 THEN
    p_fx_usd_to_eur := 0.92;
  END IF;

  SELECT id INTO v_existing_id
    FROM public.ai_call_ledger
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Chiamata già registrata (idempotency_key)'
    );
  END IF;

  v_cost_real_eur := round((p_cost_real_usd * p_fx_usd_to_eur)::numeric, 8);
  v_tokens_total := COALESCE(p_tokens_in, 0) + COALESCE(p_tokens_out, 0);

  IF p_status IN ('error', 'timeout') THEN
    v_cost_billed_eur := 0;
    v_markup_pct := 0;
    v_override_id := NULL;
  ELSE
    v_pricing := public.get_ai_pricing(p_company_id, p_tier_key);
    v_markup_pct := (v_pricing->>'applied_markup_pct')::numeric;
    v_override_id := NULLIF(v_pricing->>'override_id', '')::uuid;

    IF v_tokens_total = 0 AND v_cost_real_eur > 0 THEN
      v_cost_billed_eur := round((v_cost_real_eur * (1 + (v_markup_pct / 100.0)))::numeric, 8);
    ELSE
      v_cost_billed_eur := round((
        (COALESCE(p_tokens_in, 0)::numeric  / 1000000.0) * (v_pricing->>'retail_per_1m_input_eur')::numeric +
        (COALESCE(p_tokens_out, 0)::numeric / 1000000.0) * (v_pricing->>'retail_per_1m_output_eur')::numeric
      )::numeric, 8);
    END IF;
  END IF;

  PERFORM 1 FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;

  v_period_start := date_trunc('month', now())::date;
  UPDATE public.ai_credits
     SET mtd_spent_eur = 0,
         mtd_period_start = v_period_start,
         soft_cap_warning_sent_at = NULL
   WHERE company_id = p_company_id
     AND mtd_period_start < v_period_start;

  IF v_cost_billed_eur > 0 THEN
    UPDATE public.ai_credits
       SET balance_eur     = balance_eur - v_cost_billed_eur,
           total_spent_eur = COALESCE(total_spent_eur, 0) + v_cost_billed_eur,
           mtd_spent_eur   = COALESCE(mtd_spent_eur, 0) + v_cost_billed_eur,
           updated_at      = now()
     WHERE company_id = p_company_id
     RETURNING balance_eur INTO v_balance_after;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet AI non trovato per company %', p_company_id USING ERRCODE = 'P0002';
    END IF;

    IF v_balance_after < 0 THEN
      RAISE EXCEPTION 'Saldo insufficiente: post-charge sarebbe €%', v_balance_after USING ERRCODE = '23514';
    END IF;

    UPDATE public.ai_credits
       SET calls_blocked = true,
           blocked_at = now(),
           blocked_reason = 'hard_cap_exceeded'
     WHERE company_id = p_company_id
       AND hard_cap_eur_monthly IS NOT NULL
       AND mtd_spent_eur >= hard_cap_eur_monthly
       AND calls_blocked = false;
  END IF;

  INSERT INTO public.ai_call_ledger (
    idempotency_key, company_id, user_id,
    task_key, tier_key, model_used, used_primary, fallback_index, persona_key,
    tokens_in, tokens_out,
    cost_real_usd, cost_real_eur, cost_billed_eur, fx_usd_to_eur,
    applied_markup_pct, pricing_override_id,
    status, error_message, duration_ms, metadata
  ) VALUES (
    p_idempotency_key, p_company_id, p_user_id,
    p_task_key, p_tier_key, p_model_used, p_used_primary, p_fallback_index, p_persona_key,
    COALESCE(p_tokens_in, 0), COALESCE(p_tokens_out, 0),
    p_cost_real_usd, v_cost_real_eur, v_cost_billed_eur, p_fx_usd_to_eur,
    v_markup_pct, v_override_id,
    p_status, p_error_message, p_duration_ms, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'ledger_id', v_ledger_id,
    'cost_real_eur', v_cost_real_eur,
    'cost_billed_eur', v_cost_billed_eur,
    'margin_eur', v_cost_billed_eur - v_cost_real_eur,
    'balance_after', v_balance_after,
    'applied_markup_pct', v_markup_pct,
    'tokenless_billing_applied', (v_tokens_total = 0 AND v_cost_real_eur > 0 AND p_status = 'success')
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id FROM public.ai_call_ledger WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Concurrent insert prevented duplicate'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_ai_call(text, uuid, uuid, text, text, text, boolean, int, text, int, int, numeric, numeric, text, text, int, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_ai_call(text, uuid, uuid, text, text, text, boolean, int, text, int, int, numeric, numeric, text, text, int, jsonb) TO service_role;
