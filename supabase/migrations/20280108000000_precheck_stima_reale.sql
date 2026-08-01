-- Precheck credito AI: stima REALE invece della costante 0.10 EUR.
--
-- PROBLEMA (misurato su ai_call_ledger, 2026-08-01):
--   aiRouter passava sempre `estimatedCostEur ?? 0.10` e precheck_ai_credit
--   blocca quando `balance < stima * 1.5`, cioè sotto 0.15 EUR SEMPRE — anche
--   per un task che costa davvero 0.0018 EUR (text_summarize: p95 addebitato
--   0.0027 EUR). Risultato: fino a 0.15 EUR di credito residuo restano
--   inutilizzabili anche quando basterebbero per ~80 chiamate.
--   Nell'altra direzione la costante e' troppo BASSA per i task pesanti
--   (persona_silvio con catalogo tool pieno: ~0.145 EUR addebitati, contro una
--   soglia di 0.15) — margine di un millesimo prima dello sconfino, e
--   charge_ai_call scala il saldo SENZA clamp a zero.
--
-- SOLUZIONE: se il chiamante passa tier + token stimati, la stima si calcola
-- qui con `get_ai_pricing` — la STESSA fonte prezzi che usera' charge_ai_call
-- al momento dell'addebito (override per-azienda inclusi). Una sola fonte di
-- verita', zero round-trip in piu': il precheck era gia' una chiamata RPC.
--
-- COMPATIBILITA': i nuovi parametri hanno un default, quindi i chiamanti
-- vecchi (2 argomenti) continuano a funzionare con la costante di prima.
-- La firma a 2 argomenti va rimossa esplicitamente, altrimenti resterebbe
-- come overload e renderebbe ambigua la chiamata a 2 argomenti.

DROP FUNCTION IF EXISTS public.precheck_ai_credit(uuid, numeric);

CREATE OR REPLACE FUNCTION public.precheck_ai_credit(
  p_company_id         uuid,
  p_estimated_cost_eur numeric DEFAULT 0.10,
  p_tier_key           text    DEFAULT NULL,
  p_tokens_in          int     DEFAULT NULL,
  p_tokens_out         int     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credits record;
  v_pricing jsonb;
  v_est     numeric;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_cost_eur < 0 THEN
    RAISE EXCEPTION 'estimated_cost_eur non può essere negativo' USING ERRCODE = '22023';
  END IF;

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

  IF v_credits.balance_eur < (v_est * 1.5) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance',
      'message', format('Saldo €%s insufficiente per stima €%s',
                        round(v_credits.balance_eur, 2), round(v_est, 4)),
      'balance_eur', v_credits.balance_eur, 'estimated_cost_eur', v_est);
  END IF;

  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND v_credits.mtd_spent_eur + v_est > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hard_cap_exceeded',
      'message', format('Hard cap mensile €%s superato (MTD: €%s)',
                       round(v_credits.hard_cap_eur_monthly, 2), round(v_credits.mtd_spent_eur, 4)),
      'hard_cap_eur_monthly', v_credits.hard_cap_eur_monthly, 'mtd_spent_eur', v_credits.mtd_spent_eur);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'balance_eur', v_credits.balance_eur, 'mtd_spent_eur', v_credits.mtd_spent_eur,
    'estimated_cost_eur', v_est,
    'soft_cap_eur_monthly', v_credits.soft_cap_eur_monthly,
    'soft_cap_pct_used', CASE
      WHEN v_credits.soft_cap_eur_monthly > 0
      THEN round((v_credits.mtd_spent_eur / v_credits.soft_cap_eur_monthly * 100.0)::numeric, 2)
      ELSE 0 END,
    'soft_cap_warning', v_credits.soft_cap_eur_monthly > 0
      AND v_credits.mtd_spent_eur >= v_credits.soft_cap_eur_monthly * 0.80);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.precheck_ai_credit(uuid, numeric, text, int, int)
  TO authenticated, service_role;
