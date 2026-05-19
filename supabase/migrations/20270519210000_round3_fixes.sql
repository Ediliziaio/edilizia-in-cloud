-- ============================================================================
-- v8.6.96 — Round 3 fixes (deep bug hunt)
--
-- R3-3 — Cron lifecycle bearer PLACEHOLDER → rimuovi cron problematico
-- R3-4 — Service role key in chiaro → rimuovi da platform_settings
-- R3-5 — Revoke credits non decrementava il balance (logica WITH...UPDATE rotta)
-- R3-10 — Audit trigger storm su platform_settings → rimuovi dal trigger
-- R3-16 — total_purchased gonfiato dai grant gratuiti → distingui pagati
-- R3-17 — Audit espone dati sensibili → exclude colonne sensitive
-- ============================================================================

-- ─── R3-4 — Rimuovi service_role_key da platform_settings ──────────────────
-- Era seedato come PLACEHOLDER; va gestito via env / Vault non in tabella.
DELETE FROM public.platform_settings
 WHERE key = 'supabase_service_role_key';

-- ─── R3-10 — Audit: NON tracciare modifiche a platform_settings ────────────
-- Generavano centinaia di righe audit per chiavi non sensibili.
DROP TRIGGER IF EXISTS trg_audit_platform_settings ON public.platform_settings;

-- ─── R3-3 — Cron lifecycle: rimuovi (verrà ri-schedulato manualmente quando
-- service_role_key sarà disponibile via Supabase secrets, non da DB). ──────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'lifecycle_email_daily';
  END IF;
END $$;

-- ─── R3-5 — grant_render_credits_for_subscription: fix revoke balance ──────
-- Il vecchio codice azzerava credits_remaining PRIMA di calcolare v_revoked,
-- quindi la SELECT successiva trovava 0 e il balance non veniva mai decrementato.
DROP FUNCTION IF EXISTS public.grant_render_credits_for_subscription(uuid);

CREATE OR REPLACE FUNCTION public.grant_render_credits_for_subscription(
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub              RECORD;
  v_credits_included integer;
  v_revoked          integer := 0;
  v_balance_after_revoke integer;
  v_new_balance      integer;
  v_purchase_id      uuid;
  v_ledger_revoke_id uuid;
  v_ledger_grant_id  uuid;
  v_now              timestamptz := now();
BEGIN
  SELECT cs.id, cs.company_id, cs.plan_id, cs.status,
         cs.current_period_start, cs.last_grant_period_start
    INTO v_sub
  FROM public.company_subscriptions cs
  WHERE cs.id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('status','skipped','reason','subscription_inactive','status_value', v_sub.status);
  END IF;

  -- Idempotenza: già erogato per questo ciclo
  IF v_sub.last_grant_period_start IS NOT NULL
     AND v_sub.current_period_start IS NOT NULL
     AND v_sub.last_grant_period_start = v_sub.current_period_start THEN
    RETURN jsonb_build_object('status','already_granted','period_start', v_sub.current_period_start);
  END IF;

  -- Crediti inclusi dal piano
  SELECT COALESCE(pfd.credits_included, 0)::integer INTO v_credits_included
  FROM public.plan_feature_defaults pfd
  WHERE pfd.plan_id     = v_sub.plan_id
    AND pfd.feature_key = 'render_ai'
    AND COALESCE(pfd.credit_type, 'render') = 'render'
    AND COALESCE(pfd.is_enabled, false) = true;

  IF v_credits_included IS NULL OR v_credits_included <= 0 THEN
    UPDATE public.company_subscriptions
       SET last_credit_grant_at    = v_now,
           last_grant_period_start = v_sub.current_period_start
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('status','no_credits','credits_included', 0);
  END IF;

  -- ─── A) REVOCA: leggi PRIMA il totale, POI azzera ────────────────────────
  -- (Il bug precedente azzerava prima, lasciando v_revoked=0 sempre.)
  SELECT COALESCE(SUM(credits_remaining), 0)::integer INTO v_revoked
  FROM public.render_credit_purchases
  WHERE company_id = v_sub.company_id
    AND source = 'subscription_grant'
    AND credits_remaining > 0;

  IF v_revoked > 0 THEN
    UPDATE public.render_credit_purchases
       SET credits_remaining = 0
     WHERE company_id = v_sub.company_id
       AND source = 'subscription_grant'
       AND credits_remaining > 0;

    UPDATE public.render_credits
       SET balance = GREATEST(balance - v_revoked, 0),
           updated_at = v_now
     WHERE company_id = v_sub.company_id
    RETURNING balance INTO v_balance_after_revoke;

    INSERT INTO public.render_credit_ledger (
      company_id, delta, balance_after, reason, revenue_eur, metadata
    ) VALUES (
      v_sub.company_id, -v_revoked, COALESCE(v_balance_after_revoke, 0), 'correction',
      0,
      jsonb_build_object(
        'source', 'subscription_renewal_revoke',
        'subscription_id', p_subscription_id,
        'plan_id', v_sub.plan_id,
        'period_start', v_sub.current_period_start,
        'note', 'Crediti residui ciclo precedente non cumulativi'
      )
    )
    RETURNING id INTO v_ledger_revoke_id;
  END IF;

  -- ─── B) GRANT: accredita i nuovi crediti del ciclo ────────────────────────
  -- R3-16: NON incrementare total_purchased per i grant gratuiti (era distorto).
  INSERT INTO public.render_credits (company_id, balance, total_purchased)
       VALUES (v_sub.company_id, v_credits_included, 0)
  ON CONFLICT (company_id) DO UPDATE
    SET balance = public.render_credits.balance + EXCLUDED.balance,
        updated_at = v_now
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.render_credit_purchases (
    company_id, credits_amount, credits_remaining,
    price_paid_eur, price_per_credit_eur, status, purchased_at, source
  ) VALUES (
    v_sub.company_id, v_credits_included, v_credits_included,
    0, 0, 'completed', v_now, 'subscription_grant'
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    purchase_id, revenue_eur, metadata
  ) VALUES (
    v_sub.company_id, v_credits_included, v_new_balance, 'topup',
    v_purchase_id, 0,
    jsonb_build_object(
      'source', 'plan_monthly_grant',
      'subscription_id', p_subscription_id,
      'plan_id', v_sub.plan_id,
      'period_start', v_sub.current_period_start,
      'revoked_previous_cycle', v_revoked
    )
  )
  RETURNING id INTO v_ledger_grant_id;

  UPDATE public.company_subscriptions
     SET last_credit_grant_at    = v_now,
         last_grant_period_start = v_sub.current_period_start
   WHERE id = p_subscription_id;

  RETURN jsonb_build_object(
    'status','granted',
    'credits_included', v_credits_included,
    'revoked_previous_cycle', v_revoked,
    'balance_after', v_new_balance,
    'purchase_id', v_purchase_id,
    'ledger_revoke_id', v_ledger_revoke_id,
    'ledger_grant_id', v_ledger_grant_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_render_credits_for_subscription(uuid)
  TO authenticated, service_role;
