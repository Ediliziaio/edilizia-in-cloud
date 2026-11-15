-- Revisione del 15/11/2026, punti 4 e 5 (docs/ai-addebiti-censimento.md).
--
-- 1. `deduct_ai_credits_with_markup` nel repository era ferma alla versione di
--    20280130000000, senza il portafoglio unico (`pool_consuma`); il database
--    ha quella nuova da settembre. Qui la definizione ATTUALE, presa con
--    pg_get_functiondef e riapplicata identica (stesso md5 dopo l'applicazione):
--    chi ricostruisce il database dal repository ottiene la stessa funzione.
-- 2. `addebita_ai_diretta`: se `deduct_ai_credits_with_markup` alza un errore
--    (23514 da `pool_consuma` quando il portafoglio non basta, o altro), prima
--    l'intera chiamata si annullava e non restava nessuna riga: il provider era
--    già pagato e il consumo spariva. Ora l'errore si prende in un blocco a parte
--    e si scrive la riga `non_addebitato` col motivo (lo SQLSTATE).

-- ── 1. definizione attuale ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_ai_credits_with_markup(p_company_id uuid, p_task_kind text, p_model_used text, p_cost_usd_real numeric, p_tokens_prompt integer, p_tokens_completion integer, p_wa_message_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(ok boolean, reason text, cost_real_eur numeric, cost_billed_eur numeric, margin_eur numeric, balance_before numeric, balance_after numeric, markup_used numeric, usage_log_id uuid, tx_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate          NUMERIC;
  v_markup        NUMERIC;
  v_markup_source TEXT;
  v_cost_real     NUMERIC;
  v_cost_billed   NUMERIC;
  v_margin        NUMERIC;
  v_balance       NUMERIC;
  v_free          NUMERIC;
  v_avail         NUMERIC;
  v_blocked       BOOLEAN;
  v_from_free     NUMERIC;
  v_from_paid     NUMERIC;
  v_new_avail     NUMERIC;
  v_log_id        UUID;
  v_tx_id         UUID;
  v_label         TEXT;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  PERFORM public.ensure_monthly_free_ai_credits(p_company_id);

  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup
  WHERE task_kind = p_task_kind
    AND model_pattern IS NOT NULL
    AND p_model_used ILIKE model_pattern
    AND enabled = true
  ORDER BY LENGTH(model_pattern) DESC
  LIMIT 1;
  IF v_markup IS NOT NULL THEN v_markup_source := 'task+model'; END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = p_task_kind AND model_pattern IS NULL AND enabled = true;
    IF v_markup IS NOT NULL THEN v_markup_source := 'task_catchall'; END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default'
      AND model_pattern IS NOT NULL
      AND p_model_used ILIKE model_pattern
      AND enabled = true
    ORDER BY LENGTH(model_pattern) DESC
    LIMIT 1;
    IF v_markup IS NOT NULL THEN v_markup_source := 'default+model'; END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default' AND model_pattern IS NULL AND enabled = true;
    v_markup_source := 'default_catchall';
  END IF;

  IF v_markup IS NULL THEN
    RETURN QUERY SELECT false, 'markup_missing'::TEXT,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  v_cost_real   := COALESCE(p_cost_usd_real, 0) * v_rate;
  v_cost_billed := v_cost_real * v_markup;
  v_margin      := v_cost_billed - v_cost_real;

  SELECT balance_eur, free_balance_eur, calls_blocked
    INTO v_balance, v_free, v_blocked
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.ai_credits (company_id, balance_eur)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO NOTHING;
    v_balance := 0;
    v_blocked := false;
  END IF;

  v_free  := COALESCE(v_free, 0);
  v_avail := COALESCE(v_balance, 0) + v_free;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_avail, v_avail, v_markup, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_avail < v_cost_billed THEN
    RETURN QUERY SELECT false, 'insufficient_credits'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_avail, v_avail, v_markup, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Prima l'omaggio (scade a fine mese), poi la ricarica (non scade).
  v_from_free := LEAST(v_free, v_cost_billed);
  v_from_paid := v_cost_billed - v_from_free;
  v_new_avail := v_avail - v_cost_billed;

  UPDATE public.ai_credits
  SET free_balance_eur = v_free - v_from_free,
      total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed,
      updated_at       = now()
  WHERE company_id = p_company_id;
  -- L'omaggio resta su ai_credits (scade a fine mese); la parte a pagamento
  -- esce dal portafoglio unico, che e' la fonte di verita' del saldo.
  IF v_from_paid > 0 THEN
    PERFORM public.pool_consuma(p_company_id, 'ai', v_from_paid,
      format('AI — %s', p_task_kind),
      jsonb_build_object('model', p_model_used, 'task_kind', p_task_kind));
  END IF;

  SELECT COALESCE(apm.display_label, p_task_kind) INTO v_label
  FROM public.ai_pricing_markup apm
  WHERE apm.task_kind = p_task_kind AND apm.model_pattern IS NULL
  LIMIT 1;
  IF v_label IS NULL THEN v_label := p_task_kind; END IF;

  INSERT INTO public.ai_credit_transactions (
    company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
  ) VALUES (
    p_company_id, 'consumo_ai', v_cost_billed, v_avail, v_new_avail,
    format('AI — %s [%s]', v_label, split_part(p_model_used, '/', 2)),
    jsonb_build_object(
      'task_kind',     p_task_kind,
      'model_used',    p_model_used,
      'markup_source', v_markup_source,
      'tokens_total',  p_tokens_prompt + p_tokens_completion,
      'wa_message_id', p_wa_message_id,
      'source',        'ai_provider',
      'da_omaggio',    v_from_free,
      'da_ricarica',   v_from_paid
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind,
    model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total,
    cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct,
    cost_billed_eur, margin_eur,
    credits_deducted, credit_tx_id,
    wa_message_id, metadata
  ) VALUES (
    now(), p_company_id, p_task_kind,
    p_model_used, p_model_used,
    split_part(p_model_used, '/', 1), 0,
    p_tokens_prompt, p_tokens_completion,
    p_tokens_prompt + p_tokens_completion,
    p_cost_usd_real, true,
    v_rate, v_cost_real, (v_markup - 1) * 100,
    v_cost_billed, v_margin,
    true, v_tx_id,
    p_wa_message_id,
    p_metadata || jsonb_build_object(
      'markup_source', v_markup_source,
      'da_omaggio',    v_from_free,
      'da_ricarica',   v_from_paid
    )
  )
  RETURNING id INTO v_log_id;

  -- L'avviso saldo basso guarda il totale spendibile.
  UPDATE public.ai_credits
  SET alert_email_sent_at = now()
  WHERE company_id = p_company_id
    AND v_new_avail < COALESCE(alert_threshold_eur, 0)
    AND (alert_email_sent_at IS NULL
         OR alert_email_sent_at < now() - interval '24 hours');

  RETURN QUERY SELECT true, 'success'::TEXT,
    v_cost_real, v_cost_billed, v_margin,
    v_avail, v_new_avail, v_markup,
    v_log_id, v_tx_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.deduct_ai_credits_with_markup(uuid,text,text,numeric,integer,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_ai_credits_with_markup(uuid,text,text,numeric,integer,integer,uuid,jsonb) TO service_role;

-- ── 2. addebita_ai_diretta: l'errore dell'addebito non cancella il consumo ──
CREATE OR REPLACE FUNCTION public.addebita_ai_diretta(
  p_idempotency_key text,
  p_company_id uuid,
  p_task_kind text,
  p_model_used text,
  p_cost_usd_real numeric,
  p_tokens_prompt integer,
  p_tokens_completion integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id      uuid;
  v_rate    numeric;
  r         record;
  v_meta    jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_ok      boolean := false;
  v_reason  text;
  v_billed  numeric;
  v_markup  numeric;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) < 8 THEN
      RAISE EXCEPTION 'idempotency_key troppo corta' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('ai_diretta:' || p_idempotency_key, 0));
    SELECT id INTO v_id FROM public.ai_model_usage_log WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'charged', false, 'reason', 'idempotent_replay',
                                'idempotent_replay', true, 'usage_log_id', v_id);
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 0.92) INTO v_rate
    FROM public.platform_settings WHERE key = 'usd_eur_rate';
  v_rate := COALESCE(v_rate, 0.92);

  IF p_company_id IS NULL THEN
    INSERT INTO public.ai_model_usage_log (
      ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
      tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
      usd_eur_rate, cost_real_eur, cost_billed_eur, margin_eur, credits_deducted,
      cost_is_estimated, error_code, metadata, idempotency_key
    ) VALUES (
      now(), NULL, p_task_kind, p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
      COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
      COALESCE(p_tokens_prompt, 0) + COALESCE(p_tokens_completion, 0), COALESCE(p_cost_usd_real, 0), true,
      v_rate, COALESCE(p_cost_usd_real, 0) * v_rate, 0, 0, false,
      COALESCE((v_meta->>'cost_is_estimated')::boolean, true), 'interno_piattaforma',
      v_meta || jsonb_build_object('interno', true), p_idempotency_key
    ) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'charged', false, 'reason', 'no_company', 'usage_log_id', v_id);
  END IF;

  -- L'addebito in un blocco a parte: un errore (portafoglio che non basta in
  -- pool_consuma, 23514, o altro) annulla solo l'addebito, non la riga sotto.
  BEGIN
    SELECT * INTO r FROM public.deduct_ai_credits_with_markup(
      p_company_id, p_task_kind, p_model_used, p_cost_usd_real,
      COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0), NULL, v_meta);
    v_ok := COALESCE(r.ok, false);
    v_reason := r.reason;
    v_billed := r.cost_billed_eur;
    v_markup := r.markup_used;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    v_reason := 'errore_' || SQLSTATE;
    v_billed := NULL;
    v_markup := NULL;
  END;

  IF v_ok THEN
    UPDATE public.ai_model_usage_log SET idempotency_key = p_idempotency_key WHERE id = r.usage_log_id;
    RETURN jsonb_build_object('ok', true, 'charged', true, 'reason', 'success',
      'cost_real_eur', r.cost_real_eur, 'cost_billed_eur', r.cost_billed_eur, 'margin_eur', r.margin_eur,
      'balance_before', r.balance_before, 'balance_after', r.balance_after,
      'markup_used', r.markup_used, 'usage_log_id', r.usage_log_id);
  END IF;

  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur, credits_deducted,
    cost_is_estimated, error_code, error_detail, metadata, idempotency_key
  ) VALUES (
    now(), p_company_id, p_task_kind, p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
    COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
    COALESCE(p_tokens_prompt, 0) + COALESCE(p_tokens_completion, 0), COALESCE(p_cost_usd_real, 0), true,
    v_rate, COALESCE(p_cost_usd_real, 0) * v_rate, COALESCE((v_markup - 1) * 100, NULL), 0,
    -(COALESCE(p_cost_usd_real, 0) * v_rate), false,
    COALESCE((v_meta->>'cost_is_estimated')::boolean, true), 'non_addebitato',
    v_reason, v_meta || jsonb_build_object('addebito_mancato', v_reason, 'prezzo_non_addebitato_eur', v_billed),
    p_idempotency_key
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', false, 'charged', false, 'reason', v_reason, 'usage_log_id', v_id,
    'cost_billed_eur', v_billed);
END;
$$;

REVOKE ALL ON FUNCTION public.addebita_ai_diretta(text, uuid, text, text, numeric, integer, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.addebita_ai_diretta(text, uuid, text, text, numeric, integer, integer, jsonb)
  TO service_role;
