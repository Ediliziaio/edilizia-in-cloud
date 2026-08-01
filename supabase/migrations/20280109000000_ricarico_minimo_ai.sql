-- Ricarico minimo garantito sulla rivendita AI (2026-08-01)
--
-- PROBLEMA. Il prezzo al cliente si calcola dal listino interno del tier
-- (ai_pricing_tiers.cost_per_1m_*) moltiplicato per markup_pct/100. Ma quel
-- listino invecchia: misurato sul ledger di produzione (1073 chiamate) era
-- sotto il costo vero di 3.6x su t1_economic, 2.3x su t2_vision, 3.2x su
-- t3_balanced. Risultato: il markup "350%" dichiarato diventava -4% su t1
-- (SOTTOCOSTO), +54% su t2, +10% su t3.
--
-- La causa non e' un numero sbagliato, e' il disegno: un tier NON e' un
-- modello. Sotto t2_vision sono girati 13 modelli diversi con costo reale da
-- 0,078 a 3,663 EUR/1M — un fattore 47 — e un terzo delle chiamate arriva da
-- FALLBACK, quindi il modello che gira spesso non e' quello previsto. Fra i
-- fallback c'e' anche `openrouter/auto`, dove il modello non e' noto affatto.
-- Nessun listino statico puo' inseguire tutto questo.
--
-- SOLUZIONE. Il costo reale fatturato da OpenRouter arriva gia' dentro
-- charge_ai_call ed e' l'unico dato sempre aggiornato. Lo usiamo come
-- PAVIMENTO: l'addebito non scende mai sotto costo * moltiplicatore minimo.
-- Nel caso normale vince il prezzo del tier (prevedibile per il cliente); nel
-- caso patologico vince il pavimento e il margine e' garantito comunque.
--
-- POLITICA (decisa dal titolare): minimo 3x ovunque, 10x sui sistemi che
-- costano poco — dove un ricarico alto resta comunque economico in assoluto.
--
-- NOTA su markup_pct: get_ai_pricing lo interpreta come MOLTIPLICATORE
-- (350 => x3.5), mentre il ramo "tokenless" di charge_ai_call lo usa come
-- percentuale aggiuntiva (350 => x4.5). L'ambiguita' resta com'e' per non
-- cambiare gli importi storici, ma il pavimento qui sotto e' espresso in
-- moltiplicatore esplicito, senza margine di interpretazione.

ALTER TABLE public.ai_pricing_tiers
  ADD COLUMN IF NOT EXISTS min_markup_multiplier numeric NOT NULL DEFAULT 3.0;

COMMENT ON COLUMN public.ai_pricing_tiers.min_markup_multiplier IS
  'Ricarico minimo garantito sul costo REALE del provider. L''addebito non scende mai sotto costo * questo valore, qualunque modello sia girato (fallback e openrouter/auto inclusi).';

-- Sistemi economici: ricarico alto, resta comunque poco in valore assoluto.
UPDATE public.ai_pricing_tiers SET min_markup_multiplier = 10.0
 WHERE tier_key IN ('t0_nano', 't1_economic');

-- Sistemi cari: 3x e' il minimo sostenibile senza uscire dal mercato.
UPDATE public.ai_pricing_tiers SET min_markup_multiplier = 3.0
 WHERE tier_key IN ('t2_vision', 't3_balanced', 't4_premium', 't5_deep');


-- ── get_ai_pricing: espone il moltiplicatore minimo ──────────────────
CREATE OR REPLACE FUNCTION public.get_ai_pricing(p_company_id uuid, p_tier_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier         record;
  v_override     record;
  v_markup_pct   numeric;
  v_discount_pct numeric;
  v_retail_in    numeric;
  v_retail_out   numeric;
BEGIN
  -- 1) Carica tier base
  SELECT * INTO v_tier
    FROM public.ai_pricing_tiers
   WHERE tier_key = p_tier_key AND enabled = true;

  IF NOT FOUND THEN
    -- Fallback safe se tier non esiste: usa T1 economic
    SELECT * INTO v_tier
      FROM public.ai_pricing_tiers
     WHERE tier_key = 't1_economic' AND enabled = true;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun tier pricing disponibile (configura ai_pricing_tiers)';
  END IF;

  -- 2) Cerca override attiva per la company (priorità: tier-specific > all-tiers)
  SELECT * INTO v_override
    FROM public.ai_pricing_overrides
   WHERE company_id = p_company_id
     AND enabled = true
     AND (tier_key = v_tier.tier_key OR tier_key IS NULL)
     AND (valid_from IS NULL OR valid_from <= now())
     AND (valid_until IS NULL OR valid_until > now())
   ORDER BY tier_key NULLS LAST  -- tier-specific prima di all-tiers
   LIMIT 1;

  v_markup_pct := COALESCE(v_override.custom_markup_pct, v_tier.markup_pct);
  v_discount_pct := COALESCE(v_override.discount_pct, 0);

  -- 3) Calcola retail effettivi
  v_retail_in  := v_tier.cost_per_1m_input_eur  * v_markup_pct / 100.0
                  * (1.0 - v_discount_pct / 100.0);
  v_retail_out := v_tier.cost_per_1m_output_eur * v_markup_pct / 100.0
                  * (1.0 - v_discount_pct / 100.0);

  RETURN jsonb_build_object(
    'tier_key', v_tier.tier_key,
    'tier_label', v_tier.tier_label,
    'customer_label', v_tier.customer_label,
    'cost_per_1m_input_eur', v_tier.cost_per_1m_input_eur,
    'cost_per_1m_output_eur', v_tier.cost_per_1m_output_eur,
    'retail_per_1m_input_eur', v_retail_in,
    'retail_per_1m_output_eur', v_retail_out,
    'applied_markup_pct', v_markup_pct,
    'min_markup_multiplier', COALESCE(v_tier.min_markup_multiplier, 3.0),
    'applied_discount_pct', v_discount_pct,
    'override_id', v_override.id,
    'override_reason', v_override.reason
  );
END;
$function$
;

-- ── charge_ai_call: applica il pavimento ─────────────────────────────
CREATE OR REPLACE FUNCTION public.charge_ai_call(p_idempotency_key text, p_company_id uuid, p_user_id uuid, p_task_key text, p_tier_key text, p_model_used text, p_used_primary boolean, p_fallback_index integer, p_persona_key text, p_tokens_in integer, p_tokens_out integer, p_cost_real_usd numeric, p_fx_usd_to_eur numeric, p_status text DEFAULT 'success'::text, p_error_message text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT '{}'::jsonb)
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
    -- numero sempre aggiornato, e vale anche per i fallback e per openrouter/auto,
    -- dove il modello (e il suo prezzo) non e' noto in anticipo.
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
$function$
;
