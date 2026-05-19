-- ============================================================================
-- v8.6.80 — Render Plan Credits Automation
--
-- Chiude il loop crediti render per i piani commerciali:
--   • render-only          — €30/mese, 30 render/mese inclusi, €1 cad. extra
--   • render-serramenti    — €30/mese, 30 render/mese inclusi, €1 cad. extra
--
-- Aggiunge:
--   1. Colonna `price_per_extra_render_eur` su subscription_plans (NULL=non
--      ammette pay-per-use; >0 = prezzo per ogni render eccedente il limite)
--   2. Seed plan_feature_defaults per i due piani con credits_included=30
--      e price_override=1.00 sulla feature 'render_ai'.
--   3. Colonne `last_credit_grant_at` + `last_grant_period_start` su
--      company_subscriptions per idempotenza del refill mensile.
--   4. RPC `grant_render_credits_for_subscription(uuid)` idempotente, che
--      eroga i 30 crediti del ciclo corrente (skip se già erogati per
--      questo current_period_start).
--   5. Trigger AFTER INSERT/UPDATE su company_subscriptions che invoca la
--      RPC al primo "active" e a ogni rinnovo (cambio current_period_start).
--   6. RPC batch `grant_render_credits_for_active_subs()` per cron giornaliero.
--   7. RPC `purchase_extra_render_credit(uuid, integer)` per il pay-per-use:
--      crea una riga in render_credit_purchases con price_per_credit_eur =
--      plan.price_per_extra_render_eur e accredita i crediti via FIFO.
--      (Lo Stripe charge è demandato al frontend / edge function.)
--   8. pg_cron daily job che chiama il batch all'01:15 UTC.
-- ============================================================================

-- ─── 1. price_per_extra_render_eur ──────────────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS price_per_extra_render_eur numeric(10,4);

COMMENT ON COLUMN public.subscription_plans.price_per_extra_render_eur IS
  'Prezzo EUR per ogni render AI generato oltre i credits_included del piano. '
  'NULL = pay-per-use disabilitato (l''utente è bloccato al limite). '
  '>0 = il frontend può proporre un acquisto a questo prezzo.';

-- ─── 2. Idempotenza refill su company_subscriptions ─────────────────────────
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS last_credit_grant_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_grant_period_start   timestamptz;

COMMENT ON COLUMN public.company_subscriptions.last_credit_grant_at IS
  'Quando è stato eseguito l''ultimo grant di crediti per questa subscription.';
COMMENT ON COLUMN public.company_subscriptions.last_grant_period_start IS
  'current_period_start del ciclo per cui è stato erogato l''ultimo grant. '
  'Impedisce double-grant nello stesso ciclo di billing.';

-- ─── 3. Seed plan_feature_defaults per i 2 piani render ─────────────────────
-- Idempotente: ON CONFLICT (plan_id, feature_key) DO UPDATE.
INSERT INTO public.plan_feature_defaults
  (plan_id, feature_key, is_enabled, limit_value, credits_included, credit_type, notes)
SELECT
  sp.id,
  'render_ai',
  true,
  NULL,                  -- nessun cap "hard": il gate è il balance crediti
  30,                    -- 30 render inclusi al mese
  'render',
  'Render AI: 30 inclusi/mese, €1 cad. extra (vedi price_per_extra_render_eur)'
FROM public.subscription_plans sp
WHERE sp.slug IN ('render-only', 'render-serramenti')
ON CONFLICT (plan_id, feature_key) DO UPDATE
  SET is_enabled       = EXCLUDED.is_enabled,
      credits_included = EXCLUDED.credits_included,
      credit_type      = EXCLUDED.credit_type,
      notes            = EXCLUDED.notes,
      updated_at       = now();

-- Imposta il prezzo €1 per render extra sui due piani
UPDATE public.subscription_plans
   SET price_per_extra_render_eur = 1.00
 WHERE slug IN ('render-only', 'render-serramenti');

-- ─── 4. RPC: grant render credits per UNA subscription ──────────────────────
-- Idempotente per (subscription_id, current_period_start).
-- Erogazione: crea una riga render_credit_purchases con price_per_credit_eur=0
-- e status='completed' (così la FIFO la consuma per prima senza generare
-- "revenue" fantasma su crediti inclusi), e incrementa render_credits.balance.
-- Scrive in render_credit_ledger reason='topup' per audit.
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
  v_sub             RECORD;
  v_credits_included integer;
  v_new_balance      integer;
  v_purchase_id      uuid;
  v_ledger_id        uuid;
  v_now              timestamptz := now();
BEGIN
  -- Lock la riga subscription per evitare race con trigger + cron
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

  -- Idempotenza: se questo ciclo è già stato erogato, no-op.
  IF v_sub.last_grant_period_start IS NOT NULL
     AND v_sub.current_period_start IS NOT NULL
     AND v_sub.last_grant_period_start = v_sub.current_period_start THEN
    RETURN jsonb_build_object('status','already_granted',
                              'period_start', v_sub.current_period_start);
  END IF;

  -- Leggi crediti inclusi dal piano (plan_feature_defaults > render_ai)
  SELECT COALESCE(pfd.credits_included, 0)::integer INTO v_credits_included
  FROM public.plan_feature_defaults pfd
  WHERE pfd.plan_id     = v_sub.plan_id
    AND pfd.feature_key = 'render_ai'
    AND COALESCE(pfd.credit_type, 'render') = 'render'
    AND COALESCE(pfd.is_enabled, false) = true;

  IF v_credits_included IS NULL OR v_credits_included <= 0 THEN
    -- Piano senza render inclusi: aggiorna comunque last_grant per non
    -- ricontrollare ogni minuto.
    UPDATE public.company_subscriptions
       SET last_credit_grant_at    = v_now,
           last_grant_period_start = v_sub.current_period_start
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('status','no_credits','credits_included', 0);
  END IF;

  -- Crea/aggiorna render_credits per la company (UNIQUE su company_id)
  INSERT INTO public.render_credits (company_id, balance, total_purchased)
       VALUES (v_sub.company_id, v_credits_included, v_credits_included)
  ON CONFLICT (company_id) DO UPDATE
    SET balance         = public.render_credits.balance + EXCLUDED.balance,
        total_purchased = public.render_credits.total_purchased + EXCLUDED.balance,
        updated_at      = v_now
  RETURNING balance INTO v_new_balance;

  -- Registra il grant come "purchase" a prezzo 0 (così la FIFO la consuma per
  -- prima e i crediti acquistati a pagamento restano a margine corretto).
  INSERT INTO public.render_credit_purchases (
    company_id, credits_amount, credits_remaining,
    price_paid_eur, price_per_credit_eur, status, purchased_at
  ) VALUES (
    v_sub.company_id, v_credits_included, v_credits_included,
    0, 0, 'completed', v_now
  )
  RETURNING id INTO v_purchase_id;

  -- Audit ledger
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
      'period_start', v_sub.current_period_start
    )
  )
  RETURNING id INTO v_ledger_id;

  -- Segna come erogato
  UPDATE public.company_subscriptions
     SET last_credit_grant_at    = v_now,
         last_grant_period_start = v_sub.current_period_start
   WHERE id = p_subscription_id;

  RETURN jsonb_build_object(
    'status','granted',
    'credits_included', v_credits_included,
    'balance_after', v_new_balance,
    'purchase_id', v_purchase_id,
    'ledger_id', v_ledger_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_render_credits_for_subscription(uuid)
  TO authenticated, service_role;

-- ─── 5. Trigger: auto-grant al subscribe / rinnovo ──────────────────────────
-- Si attiva quando:
--   • INSERT con status active/trialing (nuovo subscribe)
--   • UPDATE che cambia status → active/trialing
--   • UPDATE che cambia current_period_start (rinnovo da webhook Stripe)
CREATE OR REPLACE FUNCTION public.trg_grant_render_credits_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status NOT IN ('active','trialing') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.current_period_start IS DISTINCT FROM NEW.current_period_start THEN
    -- Fire-and-forget: se la grant fallisce, non blocchiamo l'INSERT/UPDATE.
    BEGIN
      PERFORM public.grant_render_credits_for_subscription(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'grant_render_credits_for_subscription failed for %: %',
        NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cs_grant_render_credits ON public.company_subscriptions;
CREATE TRIGGER trg_cs_grant_render_credits
  AFTER INSERT OR UPDATE ON public.company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_grant_render_credits_on_subscription();

-- ─── 6. Batch refill per cron ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.grant_render_credits_for_active_subs();

CREATE OR REPLACE FUNCTION public.grant_render_credits_for_active_subs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_id   uuid;
  v_count    integer := 0;
  v_granted  integer := 0;
  v_errors   integer := 0;
  v_result   jsonb;
BEGIN
  FOR v_sub_id IN
    SELECT cs.id
    FROM public.company_subscriptions cs
    WHERE cs.status IN ('active','trialing')
      AND cs.current_period_start IS NOT NULL
      AND (cs.last_grant_period_start IS NULL
           OR cs.last_grant_period_start < cs.current_period_start)
  LOOP
    v_count := v_count + 1;
    BEGIN
      v_result := public.grant_render_credits_for_subscription(v_sub_id);
      IF v_result->>'status' = 'granted' THEN
        v_granted := v_granted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'Batch grant failed for sub %: %', v_sub_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status','done',
    'checked', v_count,
    'granted', v_granted,
    'errors',  v_errors,
    'run_at',  now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_render_credits_for_active_subs()
  TO service_role;

-- ─── 7. RPC pay-per-use: acquista 1+ render extra al prezzo del piano ───────
-- NB: lo Stripe charge è gestito separatamente. Questa RPC accredita i crediti
-- una volta che il pagamento è confermato (chiamata da webhook/edge function).
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

  -- Trova il piano attivo della company
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

  -- Crea purchase
  INSERT INTO public.render_credit_purchases (
    company_id, credits_amount, credits_remaining,
    price_paid_eur, price_per_credit_eur,
    stripe_payment_intent_id, status, purchased_at
  ) VALUES (
    p_company_id, p_credits, p_credits,
    v_total_price, v_price_each,
    p_stripe_payment_intent, 'completed', now()
  )
  RETURNING id INTO v_purchase_id;

  -- Incrementa il balance
  INSERT INTO public.render_credits (company_id, balance, total_purchased)
       VALUES (p_company_id, p_credits, p_credits)
  ON CONFLICT (company_id) DO UPDATE
    SET balance         = public.render_credits.balance + EXCLUDED.balance,
        total_purchased = public.render_credits.total_purchased + EXCLUDED.balance,
        updated_at      = now()
  RETURNING balance INTO v_new_balance;

  -- Audit ledger
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

-- ─── 8. pg_cron daily refill (01:15 UTC) ────────────────────────────────────
-- Cerca tutte le subscription attive il cui current_period_start è avanzato
-- rispetto a last_grant_period_start ed eroga i crediti del nuovo ciclo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Rimuovi job precedente con stesso nome (idempotenza migration)
    PERFORM cron.unschedule('grant_render_credits_daily')
      FROM cron.job WHERE jobname = 'grant_render_credits_daily';

    PERFORM cron.schedule(
      'grant_render_credits_daily',
      '15 1 * * *',
      $cron$ SELECT public.grant_render_credits_for_active_subs(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron non disponibile: il job daily non è stato registrato.';
  END IF;
END $$;

-- ─── 9. Backfill: eroga i crediti alle company già abbonate ai piani render ─
-- Una-tantum: per ogni subscription attiva sui 2 piani render, se non ha mai
-- ricevuto i crediti del ciclo corrente, eroga.
DO $$
DECLARE
  v_sub_id uuid;
BEGIN
  FOR v_sub_id IN
    SELECT cs.id
    FROM public.company_subscriptions cs
    JOIN public.subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.status IN ('active','trialing')
      AND sp.slug IN ('render-only','render-serramenti')
      AND (cs.last_grant_period_start IS NULL
           OR cs.current_period_start IS NULL
           OR cs.last_grant_period_start < cs.current_period_start)
  LOOP
    PERFORM public.grant_render_credits_for_subscription(v_sub_id);
  END LOOP;
END $$;
