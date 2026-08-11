-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.precheck_ai_credit(p_company_id uuid, p_estimated_cost_eur numeric DEFAULT 0.10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_credits record;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_cost_eur < 0 THEN
    RAISE EXCEPTION 'estimated_cost_eur non può essere negativo' USING ERRCODE = '22023';
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

  IF v_credits.balance_eur < (p_estimated_cost_eur * 1.5) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance',
      'message', format('Saldo €%s insufficiente per stima €%s',
                        round(v_credits.balance_eur, 2), round(p_estimated_cost_eur, 4)),
      'balance_eur', v_credits.balance_eur, 'estimated_cost_eur', p_estimated_cost_eur);
  END IF;

  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND v_credits.mtd_spent_eur + p_estimated_cost_eur > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hard_cap_exceeded',
      'message', format('Hard cap mensile €%s superato (MTD: €%s)',
                       round(v_credits.hard_cap_eur_monthly, 2), round(v_credits.mtd_spent_eur, 4)),
      'hard_cap_eur_monthly', v_credits.hard_cap_eur_monthly, 'mtd_spent_eur', v_credits.mtd_spent_eur);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'balance_eur', v_credits.balance_eur, 'mtd_spent_eur', v_credits.mtd_spent_eur,
    'soft_cap_eur_monthly', v_credits.soft_cap_eur_monthly,
    'soft_cap_pct_used', CASE
      WHEN v_credits.soft_cap_eur_monthly > 0
      THEN round((v_credits.mtd_spent_eur / v_credits.soft_cap_eur_monthly * 100.0)::numeric, 2)
      ELSE 0 END,
    'soft_cap_warning', v_credits.soft_cap_eur_monthly > 0
      AND v_credits.mtd_spent_eur >= v_credits.soft_cap_eur_monthly * 0.80);
END;
$function$;
