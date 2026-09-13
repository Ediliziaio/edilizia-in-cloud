-- Lo storico crediti del cliente deve dire TUTTO quello che l'AI gli costa.
--
-- Tre buchi, trovati verificando che «quando un'azienda usa l'AI il credito
-- viene scalato» (13/09/2026):
--
--   1. charge_ai_call — l'addebito di ogni chiamata che passa dal router
--      (Silvio, personas, email, riassunti, OCR: 962 chiamate negli ultimi 30
--      giorni) — scalava il saldo ma non scriveva NIENTE in
--      ai_credit_transactions, che e' la sola fonte AI dello storico
--      (credit_transactions_unified). Il cliente vedeva il saldo scendere
--      senza una riga che dicesse perche'. Ci finivano solo i consumi del
--      percorso ai-provider: 9 righe in 90 giorni.
--
--   2. La vista credit_transactions_unified decideva entrata/uscita dal
--      SEGNO di `crediti`, ma deduct_ai_credits_with_markup scrive i consumi
--      con importo positivo: ogni consumo AI compariva come ENTRATA.
--
--   3. get_credits_usage_breakdown (grafico «consumo per servizio») leggeva
--      l'AI solo da ai_model_usage_log, cioe' ancora il percorso ai-provider:
--      il router non c'era.
--
-- Convenzione tenuta: in ai_credit_transactions l'importo e' positivo e il
-- verso lo dice `tipo` (consumo_ai / omaggio_piano / ricarica…); la vista lo
-- legge da li'. ai_call_ledger (router) e ai_model_usage_log (ai-provider)
-- sono due percorsi disgiunti: sommarli non conta niente due volte.

-- ── 1. La vista: consumo = uscita, anche con importo positivo ─────────────
CREATE OR REPLACE VIEW public.credit_transactions_unified
WITH (security_invoker = on) AS
 SELECT t.id::text AS id,
    'ai'::text AS credit_type,
    t.company_id,
        CASE
            WHEN t.tipo ILIKE 'consumo%' OR t.crediti < 0::numeric THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(t.crediti) AS amount,
    t.saldo_prima AS balance_before,
    t.saldo_dopo AS balance_after,
    COALESCE(t.tipo, 'consumo'::text) AS type,
    t.descrizione AS description,
    t.conversation_id::text AS reference_id,
    'conversation'::text AS reference_kind,
    t.metadata,
    t.creato_il AS created_at
   FROM ai_credit_transactions t
UNION ALL
 SELECT l.id::text AS id,
    'email'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.type = ANY (ARRAY['deduct'::text, 'consume'::text, 'deduction'::text]) THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    l.amount_eur AS amount,
    l.balance_before,
    l.balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    l.description,
    l.campaign_id::text AS reference_id,
    'campaign'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM email_credits_log l
UNION ALL
 SELECT l.id::text AS id,
    'whatsapp'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.amount_eur < 0::numeric THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.amount_eur) AS amount,
    l.balance_before,
    l.balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    l.description,
    l.broadcast_id::text AS reference_id,
    'broadcast'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM whatsapp_credits_log l
UNION ALL
 SELECT l.id::text AS id,
    'render'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.delta < 0 THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.delta)::numeric AS amount,
    NULL::numeric AS balance_before,
    l.balance_after::numeric AS balance_after,
    l.reason AS type,
        CASE
            WHEN l.reason = 'adjust_admin'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Rettifica crediti render da admin'::text)
            WHEN l.reason = 'consume'::text THEN 'Generazione render AI'::text
            WHEN l.reason = 'topup'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Ricarica crediti render'::text)
            WHEN l.reason = 'refund'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Rimborso crediti render'::text)
            WHEN l.reason = 'seed'::text THEN 'Seed crediti render'::text
            ELSE COALESCE(l.metadata ->> 'reason_text'::text, 'Movimento crediti render'::text)
        END AS description,
    l.session_id::text AS reference_id,
        CASE
            WHEN l.session_id IS NULL THEN 'render_wallet'::text
            ELSE 'render_session'::text
        END AS reference_kind,
    l.metadata,
    l.created_at
   FROM render_credit_ledger l
UNION ALL
 SELECT l.id::text AS id,
    'render'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.type = ANY (ARRAY['deduct'::text, 'consume'::text, 'deduction'::text]) THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.amount)::numeric AS amount,
    l.balance_before::numeric AS balance_before,
    l.balance_after::numeric AS balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    COALESCE(l.description, 'Movimento crediti render'::text) AS description,
    l.session_id::text AS reference_id,
    'render_session'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM render_credits_log l
UNION ALL
 SELECT s.id::text AS id,
    'render'::text AS credit_type,
    s.company_id,
    'out'::text AS direction,
    COALESCE(s.cost_billed, 1::numeric) AS amount,
    NULL::numeric AS balance_before,
    NULL::numeric AS balance_after,
    COALESCE(s.status, 'completed'::text) AS type,
    'Generazione render AI'::text AS description,
    s.id::text AS reference_id,
    'render_session'::text AS reference_kind,
    NULL::jsonb AS metadata,
    s.created_at
   FROM render_sessions s
  WHERE NOT (EXISTS ( SELECT 1
           FROM render_credit_ledger l
          WHERE l.session_id = s.id)) AND NOT (EXISTS ( SELECT 1
           FROM render_credits_log l
          WHERE l.session_id = s.id));

-- ── 2. Il grafico «consumo per servizio»: anche il percorso router ────────
CREATE OR REPLACE FUNCTION public.get_credits_usage_breakdown(p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR p_company_id IN (SELECT pr.company_id FROM public.profiles pr WHERE pr.id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH ops AS (
    -- email: importi positivi, type deduct/refund (refund = storno, non operazione)
    SELECT 'email' AS service, created_at AS ts,
      CASE WHEN type = 'refund' THEN -abs(amount_eur) ELSE abs(amount_eur) END AS spent,
      (type <> 'refund') AS is_op
    FROM email_credits_log
    WHERE company_id = p_company_id AND type IN ('deduct', 'refund')
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    -- whatsapp: consumi con importo negativo
    SELECT 'whatsapp', created_at, -amount_eur, true
    FROM whatsapp_credits_log
    WHERE company_id = p_company_id AND amount_eur < 0
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    -- ai, percorso ai-provider (deduct_ai_credits_with_markup)
    SELECT 'ai', ts, COALESCE(cost_billed_eur, 0), true
    FROM ai_model_usage_log
    WHERE company_id = p_company_id AND ok IS NOT FALSE
      AND ts >= p_from AND ts < p_to
    UNION ALL
    -- ai, percorso router (charge_ai_call: Silvio, personas, email, riassunti,
    -- OCR). Mancava: il grafico vedeva solo il percorso ai-provider. I due
    -- registri non si sovrappongono.
    SELECT 'ai', created_at, COALESCE(cost_billed_eur, 0), true
    FROM ai_call_ledger
    WHERE company_id = p_company_id AND status = 'success' AND COALESCE(cost_billed_eur, 0) > 0
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT 'sms', created_at, -importo, true
    FROM sms_wallet_transazioni
    WHERE company_id = p_company_id AND tipo LIKE 'addebito%'
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT 'render', created_at, COALESCE(revenue_eur, cost_billed, 0), true
    FROM render_sessions
    WHERE company_id = p_company_id AND status = 'completed'
      AND created_at >= p_from AND created_at < p_to
  )
  SELECT jsonb_build_object(
    'servizi', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service', service,
        'spent_eur', round(spent_sum::numeric, 4),
        'operations', n
      ) ORDER BY spent_sum DESC)
      FROM (
        SELECT service, sum(spent) AS spent_sum,
               count(*) FILTER (WHERE is_op) AS n
        FROM ops GROUP BY service
        HAVING sum(spent) <> 0 OR count(*) FILTER (WHERE is_op) > 0
      ) s
    ), '[]'::jsonb),
    'giorni', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'giorno', giorno,
        'spent_eur', round(spent_sum::numeric, 4)
      ) ORDER BY giorno)
      FROM (
        SELECT date_trunc('day', ts)::date AS giorno, sum(spent) AS spent_sum
        FROM ops GROUP BY 1
      ) g
    ), '[]'::jsonb),
    'totale_eur', COALESCE((SELECT round(sum(spent)::numeric, 4) FROM ops), 0),
    'totale_operazioni', COALESCE((SELECT count(*) FILTER (WHERE is_op) FROM ops), 0)
  ) INTO v;

  RETURN v;
END;
$function$;

-- ── 3. charge_ai_call: ogni addebito lascia una riga nello storico ─────────
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

  -- La riga per lo storico del cliente (credit_transactions_unified legge
  -- ai_credit_transactions). Prima l'addebito scalava il saldo e basta: il
  -- cliente vedeva il credito scendere senza una riga che dicesse perche'.
  -- Importo positivo e verso nel tipo, come deduct_ai_credits_with_markup.
  IF v_cost_billed_eur > 0 THEN
    INSERT INTO public.ai_credit_transactions (
      company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
    ) VALUES (
      p_company_id, 'consumo_ai', v_cost_billed_eur,
      COALESCE(v_balance_after, 0) + v_cost_billed_eur, COALESCE(v_balance_after, 0),
      format('AI — %s [%s]',
             CASE WHEN p_persona_key = 'silvio' THEN 'Silvio'
                  ELSE COALESCE(NULLIF(p_persona_key, ''), p_task_key) END,
             split_part(p_model_used, '/', 2)),
      jsonb_build_object(
        'source', 'ai_router',
        'task_key', p_task_key,
        'model_used', p_model_used,
        'persona_key', p_persona_key,
        'tokens_total', v_tokens_total,
        'da_omaggio', v_from_free,
        'da_portafoglio', v_from_paid,
        'ledger_id', v_ledger_id
      )
    );
  END IF;

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
