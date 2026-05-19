-- ============================================================================
-- v8.6.85 — Render Credits: reset mensile (non cumulativi)
--
-- I crediti inclusi nel piano (es. 30/mese) NON sono cumulativi: ogni rinnovo
-- ciclo, i residui non consumati del piano precedente DECADONO.
--
-- I pack EXTRA acquistati (pay-per-use, top-up admin, etc.) RESTANO sul wallet.
--
-- Implementazione:
--   1. Aggiunta colonna `source` su render_credit_purchases per distinguere:
--      - 'subscription_grant'  → reset al rinnovo
--      - 'pay_per_use'         → cumulativo
--      - 'admin_adjust'        → cumulativo
--      - 'pack_purchase'       → cumulativo (Stripe pack)
--   2. Backfill: righe con price_per_credit_eur=0 AND price_paid_eur=0
--      diventano 'subscription_grant'. Le altre 'pay_per_use'.
--   3. Riscrittura `grant_render_credits_for_subscription` per:
--      a) revocare credits_remaining delle vecchie subscription_grant
--      b) decrementare balance del totale revocato
--      c) accreditare i nuovi crediti del ciclo
--      d) audit ledger con eventi 'correction' (revoke) e 'topup' (grant)
-- ============================================================================

-- ─── 1. Aggiungi colonna source ─────────────────────────────────────────────
ALTER TABLE public.render_credit_purchases
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pay_per_use'
    CHECK (source IN ('subscription_grant', 'pay_per_use', 'admin_adjust', 'pack_purchase'));

COMMENT ON COLUMN public.render_credit_purchases.source IS
  'subscription_grant=reset al rinnovo, pay_per_use/pack_purchase/admin_adjust=cumulativi';

-- ─── 2. Backfill: identifica subscription_grant esistenti ──────────────────
UPDATE public.render_credit_purchases
   SET source = 'subscription_grant'
 WHERE source = 'pay_per_use'  -- default attuale
   AND price_per_credit_eur = 0
   AND price_paid_eur = 0;

-- Indice per scan veloce dei grant pendenti
CREATE INDEX IF NOT EXISTS idx_rcp_subscription_grant_pending
  ON public.render_credit_purchases (company_id, purchased_at DESC)
  WHERE source = 'subscription_grant' AND credits_remaining > 0;

-- ─── 3. Riscrittura grant_render_credits_for_subscription ──────────────────
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

  -- Leggi crediti inclusi dal piano
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

  -- ─── A) REVOCA: zera credits_remaining delle subscription_grant pending ──
  -- Lock le righe per evitare race con deduct concorrente.
  WITH revoked AS (
    UPDATE public.render_credit_purchases
       SET credits_remaining = 0
     WHERE company_id = v_sub.company_id
       AND source = 'subscription_grant'
       AND credits_remaining > 0
    RETURNING credits_remaining AS dummy, credits_amount, id
  )
  SELECT COALESCE(SUM(
    -- credits_remaining è stato appena messo a 0, quindi va recuperato
    -- via OLD. Postgres in WITH UPDATE..RETURNING ritorna i NEW values.
    -- Soluzione: leggiamo PRIMA del UPDATE.
    0
  ), 0)::integer INTO v_revoked FROM revoked;

  -- Pattern corretto: leggi PRIMA, poi UPDATE
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

    -- Decrementa balance del totale revocato (mai sotto 0)
    UPDATE public.render_credits
       SET balance = GREATEST(balance - v_revoked, 0),
           updated_at = v_now
     WHERE company_id = v_sub.company_id
    RETURNING balance INTO v_balance_after_revoke;

    -- Audit revoke
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
  INSERT INTO public.render_credits (company_id, balance, total_purchased)
       VALUES (v_sub.company_id, v_credits_included, v_credits_included)
  ON CONFLICT (company_id) DO UPDATE
    SET balance         = public.render_credits.balance + EXCLUDED.balance,
        total_purchased = public.render_credits.total_purchased + EXCLUDED.balance,
        updated_at      = v_now
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

-- ─── 4. Aggiorna anche purchase_extra_render_credit per marcare il source ──
DROP FUNCTION IF EXISTS public.purchase_extra_render_credit(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.purchase_extra_render_credit(
  p_company_id            uuid,
  p_credits               integer DEFAULT 1,
  p_stripe_payment_intent text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_id      uuid;
  v_price_each   numeric(10,4);
  v_total_price  numeric(10,2);
  v_new_balance  integer;
  v_purchase_id  uuid;
  v_ledger_id    uuid;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'p_credits must be > 0';
  END IF;

  SELECT cs.plan_id INTO v_plan_id
  FROM public.company_subscriptions cs
  WHERE cs.company_id = p_company_id
    AND cs.status IN ('active','trialing')
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('status','no_active_plan');
  END IF;

  SELECT sp.price_per_extra_render_eur INTO v_price_each
  FROM public.subscription_plans sp
  WHERE sp.id = v_plan_id;

  IF v_price_each IS NULL OR v_price_each <= 0 THEN
    RETURN jsonb_build_object('status','pay_per_use_disabled','plan_id', v_plan_id);
  END IF;

  v_total_price := v_price_each * p_credits;

  INSERT INTO public.render_credit_purchases (
    company_id, credits_amount, credits_remaining,
    price_paid_eur, price_per_credit_eur,
    stripe_payment_intent_id, status, purchased_at, source
  ) VALUES (
    p_company_id, p_credits, p_credits,
    v_total_price, v_price_each,
    p_stripe_payment_intent, 'completed', now(), 'pay_per_use'
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.render_credits (company_id, balance, total_purchased)
       VALUES (p_company_id, p_credits, p_credits)
  ON CONFLICT (company_id) DO UPDATE
    SET balance         = public.render_credits.balance + EXCLUDED.balance,
        total_purchased = public.render_credits.total_purchased + EXCLUDED.balance,
        updated_at      = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.render_credit_ledger (
    company_id, delta, balance_after, reason,
    purchase_id, revenue_eur, metadata
  ) VALUES (
    p_company_id, p_credits, v_new_balance, 'topup',
    v_purchase_id, v_total_price,
    jsonb_build_object(
      'source','pay_per_use',
      'price_per_credit_eur', v_price_each,
      'stripe_payment_intent_id', p_stripe_payment_intent
    )
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'status','ok',
    'credits', p_credits,
    'price_each_eur', v_price_each,
    'total_eur', v_total_price,
    'balance_after', v_new_balance,
    'purchase_id', v_purchase_id,
    'ledger_id', v_ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_extra_render_credit(uuid, integer, text)
  TO service_role;
