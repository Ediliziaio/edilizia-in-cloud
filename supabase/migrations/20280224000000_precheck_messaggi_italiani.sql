-- I messaggi del precheck crediti parlavano l'euro all'inglese
--
-- "Saldo €0.00 insufficiente per stima €0.1000": simbolo davanti, punto
-- decimale, quattro cifre — e questo testo finisce DAVANTI all'utente nella
-- chat e negli errori AI. L'audit completo delle 181 pagine dell'app ha
-- trovato il formato inglese solo qui e nei formatter frontend (gia'
-- sistemati): questa migration chiude l'ultima fonte. Solo i due format()
-- dei messaggi cambiano ("0,00 €" e stima a 2 decimali percepibili);
-- la logica di stima, pavimento e cap resta identica al carattere.

CREATE OR REPLACE FUNCTION public.precheck_ai_credit(p_company_id uuid, p_estimated_cost_eur numeric DEFAULT 0.10, p_tier_key text DEFAULT NULL::text, p_tokens_in integer DEFAULT NULL::integer, p_tokens_out integer DEFAULT NULL::integer)
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
      'message', format('Saldo %s € insufficiente per la stima di %s €',
                        replace(round(v_credits.balance_eur, 2)::text, '.', ','),
                        replace(round(v_est, 4)::text, '.', ',')),
      'balance_eur', v_credits.balance_eur, 'estimated_cost_eur', v_est);
  END IF;

  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND v_credits.mtd_spent_eur + v_est > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hard_cap_exceeded',
      'message', format('Tetto mensile di %s € superato (speso: %s €)',
                       replace(round(v_credits.hard_cap_eur_monthly, 2)::text, '.', ','),
                       replace(round(v_credits.mtd_spent_eur, 2)::text, '.', ',')),
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
