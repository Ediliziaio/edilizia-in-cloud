-- AI diretta (chiamate fuori dal router): chiave di idempotenza e consumi non addebitati
-- registrati. Censimento del 15/11/2026, docs/ai-addebiti-censimento.md.
--
-- Prima: `chargeAndLogDirect` chiamava `deduct_ai_credits_with_markup` DOPO la
-- chiamata al provider, senza chiave. Due difetti:
--   1. un retry (webhook, cron che riparte, doppio clic) addebitava due volte;
--   2. se l'addebito non passava (credito finito nel frattempo, azienda
--      bloccata, ricarico mancante) la funzione tornava `ok=false` SENZA
--      scrivere niente: il provider era già pagato, il consumo spariva.
-- Ora `addebita_ai_diretta` fa da porta unica: chiave → lock → se c'è già,
-- replay; altrimenti addebito; se l'addebito non passa, una riga con
-- `credits_deducted=false` e il motivo, col costo vero. Nessun prezzo cambia:
-- il ricarico resta quello di `ai_pricing_markup` letto da
-- `deduct_ai_credits_with_markup`.

ALTER TABLE public.ai_model_usage_log ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_usage_log_idempotency
  ON public.ai_model_usage_log (idempotency_key) WHERE idempotency_key IS NOT NULL;

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
  v_id    uuid;
  v_rate  numeric;
  r       record;
  v_meta  jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) < 8 THEN
      RAISE EXCEPTION 'idempotency_key troppo corta' USING ERRCODE = '22023';
    END IF;
    -- Due richieste simultanee con la stessa chiave: la seconda aspetta la prima.
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

  -- Senza azienda: costo della piattaforma, registrato e dichiarato.
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

  SELECT * INTO r FROM public.deduct_ai_credits_with_markup(
    p_company_id, p_task_kind, p_model_used, p_cost_usd_real,
    COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0), NULL, v_meta);

  IF r.ok THEN
    UPDATE public.ai_model_usage_log SET idempotency_key = p_idempotency_key WHERE id = r.usage_log_id;
    RETURN jsonb_build_object('ok', true, 'charged', true, 'reason', 'success',
      'cost_real_eur', r.cost_real_eur, 'cost_billed_eur', r.cost_billed_eur, 'margin_eur', r.margin_eur,
      'balance_before', r.balance_before, 'balance_after', r.balance_after,
      'markup_used', r.markup_used, 'usage_log_id', r.usage_log_id);
  END IF;

  -- Il provider ha già lavorato ma l'addebito non è passato: il consumo resta
  -- registrato col costo vero e il motivo, a zero per l'azienda. Cosa farne
  -- (addebitare in negativo, assorbire) è una decisione commerciale aperta.
  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur, credits_deducted,
    cost_is_estimated, error_code, error_detail, metadata, idempotency_key
  ) VALUES (
    now(), p_company_id, p_task_kind, p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
    COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
    COALESCE(p_tokens_prompt, 0) + COALESCE(p_tokens_completion, 0), COALESCE(p_cost_usd_real, 0), true,
    v_rate, COALESCE(p_cost_usd_real, 0) * v_rate, COALESCE((r.markup_used - 1) * 100, NULL), 0,
    -(COALESCE(p_cost_usd_real, 0) * v_rate), false,
    COALESCE((v_meta->>'cost_is_estimated')::boolean, true), 'non_addebitato',
    r.reason, v_meta || jsonb_build_object('addebito_mancato', r.reason, 'prezzo_non_addebitato_eur', r.cost_billed_eur),
    p_idempotency_key
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', false, 'charged', false, 'reason', r.reason, 'usage_log_id', v_id,
    'cost_billed_eur', r.cost_billed_eur);
END;
$$;

REVOKE ALL ON FUNCTION public.addebita_ai_diretta(text, uuid, text, text, numeric, integer, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.addebita_ai_diretta(text, uuid, text, text, numeric, integer, integer, jsonb)
  TO service_role;
