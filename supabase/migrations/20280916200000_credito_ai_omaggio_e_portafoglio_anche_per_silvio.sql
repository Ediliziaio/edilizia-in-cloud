-- Credito AI: l'omaggio del piano e il portafoglio unico valgono anche per Silvio
--
-- Silvio — e ogni chiamata AI che passa da aiRouter: personas, riassunti,
-- classificatore, composizione email — controlla il credito con
-- precheck_ai_credit e lo scala con charge_ai_call. Tutte e due erano rimaste
-- al modello vecchio, a un borsellino solo:
--
--   1. precheck_ai_credit guardava soltanto ai_credits.balance_eur, cioe' la
--      ricarica. Non chiamava ensure_monthly_free_ai_credits e ignorava
--      free_balance_eur: un'azienda Enterprise con 25 EUR al mese di crediti
--      inclusi nel piano e nessuna ricarica riceveva «Credito insufficiente».
--      Negli ultimi 90 giorni e' successo 11 volte a Suntech e Ser Style, ed
--      e' il motivo per cui l'omaggio non si e' MAI acceso: nessuno lo
--      rinnovava per loro.
--
--   2. charge_ai_call scalava ai_credits.balance_eur direttamente. Dal
--      07/09/2026 la fonte di verita' e' company_credit_pool, e pool_rispecchia()
--      riscrive ai_credits.balance_eur col saldo del portafoglio a ogni consumo
--      email o WhatsApp: gli addebiti AI venivano cancellati dal primo
--      rispecchio successivo. Misurato: 176 chiamate addebitate a registro dal
--      07/09, zero movimenti 'ai' nel registro del portafoglio.
--
-- Ora le due funzioni fanno quello che gia' fanno check_ai_credits_available e
-- deduct_ai_credits_with_markup: rinnovano l'omaggio del mese, contano
-- ricarica + omaggio, scalano prima l'omaggio (che scade) e poi il portafoglio
-- (pool_consuma, che rispecchia da solo). Firme, default e codici d'errore
-- invariati. Le aziende senza portafoglio unico scalano come prima, dal
-- borsellino AI.
--
-- precheck_ai_credit era STABLE: ora e' VOLATILE, perche' rinnovare l'omaggio
-- e' una scrittura e perche' la lettura successiva deve vederla.

CREATE OR REPLACE FUNCTION public.precheck_ai_credit(
  p_company_id uuid,
  p_estimated_cost_eur numeric DEFAULT 0.10,
  p_tier_key text DEFAULT NULL::text,
  p_tokens_in integer DEFAULT NULL::integer,
  p_tokens_out integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credits record;
  v_pricing jsonb;
  v_est     numeric;
  v_free    numeric;
  v_avail   numeric;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant (reader)
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_cost_eur < 0 THEN
    RAISE EXCEPTION 'estimated_cost_eur non può essere negativo' USING ERRCODE = '22023';
  END IF;

  -- Omaggio del mese: si rinnova qui, non solo nei percorsi che passano da
  -- check_ai_credits_available. Ritorna quanto ne resta (crea la riga
  -- ai_credits se manca).
  v_free := COALESCE(public.ensure_monthly_free_ai_credits(p_company_id), 0);

  -- ── Stima: dai token quando disponibili, altrimenti la costante ────────
  v_est := p_estimated_cost_eur;
  IF p_tier_key IS NOT NULL
     AND (COALESCE(p_tokens_in, 0) + COALESCE(p_tokens_out, 0)) > 0 THEN
    v_pricing := public.get_ai_pricing(p_company_id, p_tier_key);
    IF v_pricing ? 'retail_per_1m_input_eur' THEN
      v_est := (COALESCE(p_tokens_in, 0)::numeric  / 1000000.0)
                 * (v_pricing->>'retail_per_1m_input_eur')::numeric
             + (COALESCE(p_tokens_out, 0)::numeric / 1000000.0)
                 * (v_pricing->>'retail_per_1m_output_eur')::numeric;
      -- Pavimento: una stima nulla o irrisoria farebbe passare chiunque,
      -- anche a saldo zero. Un millesimo di euro e' il minimo sensato.
      v_est := GREATEST(v_est, 0.001);
    END IF;
  END IF;

  SELECT balance_eur, calls_blocked, blocked_reason,
         soft_cap_eur_monthly, hard_cap_eur_monthly,
         mtd_spent_eur, mtd_period_start
    INTO v_credits
    FROM public.ai_credits
   WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wallet_missing',
      'message', 'Wallet AI non inizializzato per questa azienda');
  END IF;

  IF v_credits.calls_blocked THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_credits.blocked_reason, 'blocked'),
      'message', 'Chiamate AI bloccate');
  END IF;

  -- Quanto si puo' spendere davvero: ricarica (specchio del portafoglio) + omaggio.
  v_avail := COALESCE(v_credits.balance_eur, 0) + v_free;

  IF v_avail < (v_est * 1.5) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance',
      'message', format('Saldo €%s insufficiente per stima €%s',
                        round(v_avail, 2), round(v_est, 4)),
      'balance_eur', v_avail,
      'paid_balance_eur', COALESCE(v_credits.balance_eur, 0),
      'free_balance_eur', v_free,
      'estimated_cost_eur', v_est);
  END IF;

  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND COALESCE(v_credits.mtd_spent_eur, 0) + v_est > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hard_cap_exceeded',
      'message', format('Hard cap mensile €%s superato (MTD: €%s)',
                       round(v_credits.hard_cap_eur_monthly, 2), round(COALESCE(v_credits.mtd_spent_eur, 0), 4)),
      'hard_cap_eur_monthly', v_credits.hard_cap_eur_monthly, 'mtd_spent_eur', v_credits.mtd_spent_eur);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'balance_eur', v_avail,
    'paid_balance_eur', COALESCE(v_credits.balance_eur, 0),
    'free_balance_eur', v_free,
    'mtd_spent_eur', v_credits.mtd_spent_eur,
    'estimated_cost_eur', v_est,
    'soft_cap_eur_monthly', v_credits.soft_cap_eur_monthly,
    'soft_cap_pct_used', CASE
      WHEN v_credits.soft_cap_eur_monthly > 0
      THEN round((COALESCE(v_credits.mtd_spent_eur, 0) / v_credits.soft_cap_eur_monthly * 100.0)::numeric, 2)
      ELSE 0 END,
    'soft_cap_warning', v_credits.soft_cap_eur_monthly > 0
      AND COALESCE(v_credits.mtd_spent_eur, 0) >= v_credits.soft_cap_eur_monthly * 0.80);
END;
$function$;

CREATE OR REPLACE FUNCTION public.charge_ai_call(
  p_idempotency_key text,
  p_company_id uuid,
  p_user_id uuid,
  p_task_key text,
  p_tier_key text,
  p_model_used text,
  p_used_primary boolean,
  p_fallback_index integer,
  p_persona_key text,
  p_tokens_in integer,
  p_tokens_out integer,
  p_cost_real_usd numeric,
  p_fx_usd_to_eur numeric,
  p_status text DEFAULT 'success'::text,
  p_error_message text DEFAULT NULL::text,
  p_duration_ms integer DEFAULT NULL::integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_min_mult      numeric;
  v_free          numeric := 0;
  v_from_free     numeric := 0;
  v_from_paid     numeric := 0;
  v_pool          jsonb;
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

    -- PAVIMENTO DI RIVENDITA (2026-08-01). Il prezzo a token dipende dal listino
    -- interno del tier, che invecchia: misurato sul ledger era sotto il costo
    -- vero fino a 3.6x, quindi t1 vendeva SOTTOCOSTO. Qui garantiamo comunque
    -- il ricarico minimo sul costo REALE fatturato da OpenRouter — che e' l'unico
    -- numero sempre aggiornato, e vale anche per i fallback, dove il modello (e
    -- il suo prezzo) non e' noto in anticipo.
    v_min_mult := COALESCE((v_pricing->>'min_markup_multiplier')::numeric, 3.0);
    IF v_cost_real_eur > 0 AND v_min_mult > 0 THEN
      v_cost_billed_eur := GREATEST(
        v_cost_billed_eur,
        round((v_cost_real_eur * v_min_mult)::numeric, 8)
      );
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
    -- Prima l'omaggio del mese (scade a fine mese), poi il portafoglio (non
    -- scade): il cliente non perde mai i soldi che ha pagato. Stesso ordine di
    -- deduct_ai_credits_with_markup.
    v_free      := COALESCE(public.ensure_monthly_free_ai_credits(p_company_id), 0);
    v_from_free := LEAST(v_free, v_cost_billed_eur);
    v_from_paid := v_cost_billed_eur - v_from_free;

    UPDATE public.ai_credits
       SET free_balance_eur = COALESCE(free_balance_eur, 0) - v_from_free,
           total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed_eur,
           mtd_spent_eur    = COALESCE(mtd_spent_eur, 0) + v_cost_billed_eur,
           updated_at       = now()
     WHERE company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet AI non trovato per company %', p_company_id USING ERRCODE = 'P0002';
    END IF;

    IF v_from_paid > 0 THEN
      IF EXISTS (SELECT 1 FROM public.company_credit_pool WHERE company_id = p_company_id) THEN
        -- Il portafoglio unico e' la fonte di verita' dal 07/09/2026:
        -- pool_consuma scala, scrive il registro con service='ai' e rispecchia
        -- il saldo su ai_credits. Se non basta alza check_violation (23514),
        -- lo stesso codice che questa funzione alzava prima.
        v_pool := public.pool_consuma(
          p_company_id, 'ai', v_from_paid,
          format('AI — %s', p_task_key),
          jsonb_build_object(
            'model', p_model_used, 'task_key', p_task_key,
            'persona_key', p_persona_key, 'idempotency_key', p_idempotency_key
          )
        );
        v_balance_after := COALESCE((v_pool->>'balance_after')::numeric, 0);
      ELSE
        -- Azienda senza portafoglio unico (fuori dal travaso del 07/09): si
        -- scala come prima, dal borsellino AI.
        UPDATE public.ai_credits
           SET balance_eur = balance_eur - v_from_paid,
               updated_at  = now()
         WHERE company_id = p_company_id
         RETURNING balance_eur INTO v_balance_after;

        IF v_balance_after < 0 THEN
          RAISE EXCEPTION 'Saldo insufficiente: post-charge sarebbe €%', v_balance_after USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSE
      SELECT balance_eur INTO v_balance_after FROM public.ai_credits WHERE company_id = p_company_id;
    END IF;

    -- Il saldo restituito e' quanto resta da spendere: ricarica + omaggio residuo.
    v_balance_after := COALESCE(v_balance_after, 0) + (v_free - v_from_free);

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
    p_status, p_error_message, p_duration_ms,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('da_omaggio', v_from_free, 'da_portafoglio', v_from_paid)
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
    'da_omaggio', v_from_free,
    'da_portafoglio', v_from_paid,
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
$function$;
