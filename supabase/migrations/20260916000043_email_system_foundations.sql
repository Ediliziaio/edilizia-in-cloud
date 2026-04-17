-- =============================================================================
-- EMAIL SYSTEM FOUNDATIONS
-- =============================================================================
-- Per the audit document (EiC-Email-System-Audit-DevMap v1.0, Sprint 1/2D/3):
--  - Add per-plan email quotas + per-email overage pricing on subscription_plans
--  - Add per-company override for custom monthly email cap
--  - Extend email_delivery_log with stream / campaign_id / cost fields
--  - Provide a single RPC (get_company_email_quota) that resolves the
--    effective limit, price and current-month usage for any company.
--
-- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE / guarded UPDATEs.
-- =============================================================================

-- ── 1. subscription_plans: email quota + overage price per plan ────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS email_monthly_included INTEGER,
  ADD COLUMN IF NOT EXISTS email_overage_price_eur NUMERIC(10,6) DEFAULT 0.0015;

COMMENT ON COLUMN public.subscription_plans.email_monthly_included IS
  'Monthly transactional email allowance included in this plan. NULL = unset, -1 = unlimited, positive = hard cap.';
COMMENT ON COLUMN public.subscription_plans.email_overage_price_eur IS
  'Per-email price billed to the company wallet after the monthly quota is exhausted.';

-- Seed sensible defaults per plan slug, without overwriting existing values.
UPDATE public.subscription_plans
   SET email_monthly_included  = 50,
       email_overage_price_eur = 0.0015
 WHERE slug = 'scopri' AND email_monthly_included IS NULL;

UPDATE public.subscription_plans
   SET email_monthly_included  = 500,
       email_overage_price_eur = 0.0015
 WHERE slug = 'starter' AND email_monthly_included IS NULL;

UPDATE public.subscription_plans
   SET email_monthly_included  = 2000,
       email_overage_price_eur = 0.0012
 WHERE slug = 'pro' AND email_monthly_included IS NULL;

UPDATE public.subscription_plans
   SET email_monthly_included  = -1,
       email_overage_price_eur = 0
 WHERE slug = 'enterprise' AND email_monthly_included IS NULL;

-- ── 2. company_billing_overrides: per-company monthly email cap ────────────
ALTER TABLE public.company_billing_overrides
  ADD COLUMN IF NOT EXISTS custom_monthly_email_limit INTEGER;

COMMENT ON COLUMN public.company_billing_overrides.custom_monthly_email_limit IS
  'SuperAdmin override for monthly email cap. NULL = use plan default; -1 = unlimited; positive = cap.';

-- ── 3. email_delivery_log: unified tracking columns ────────────────────────
ALTER TABLE public.email_delivery_log
  ADD COLUMN IF NOT EXISTS stream      TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS cost_eur    NUMERIC(10,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charged_eur NUMERIC(10,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata    JSONB;

CREATE INDEX IF NOT EXISTS idx_email_delivery_log_company_sent_at
  ON public.email_delivery_log(company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_log_stream
  ON public.email_delivery_log(stream);

-- Check constraint for stream (added once)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'email_delivery_log_stream_chk'
  ) THEN
    ALTER TABLE public.email_delivery_log
      ADD CONSTRAINT email_delivery_log_stream_chk
      CHECK (stream IS NULL OR stream IN ('marketing','transactional'));
  END IF;
END $$;

-- ── 4. RPC: get_company_email_quota(UUID) ──────────────────────────────────
-- Resolves the effective monthly email quota, pricing, and current usage
-- for a single company. Used by both super_admin UI and sendEmailUnified().
CREATE OR REPLACE FUNCTION public.get_company_email_quota(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id         UUID;
  v_plan_name       TEXT;
  v_plan_slug       TEXT;
  v_plan_limit      INTEGER;
  v_plan_price      NUMERIC;
  v_override_limit  INTEGER;
  v_override_price  NUMERIC;
  v_override_free   BOOLEAN;
  v_effective_limit INTEGER;
  v_effective_price NUMERIC;
  v_month_start     TIMESTAMPTZ;
  v_sent_this_month INTEGER;
  v_wallet_balance  NUMERIC;
  v_wallet_blocked  BOOLEAN;
BEGIN
  -- 4a. Find the company's active plan (most recent active subscription)
  SELECT cs.plan_id INTO v_plan_id
    FROM company_subscriptions cs
   WHERE cs.company_id = p_company_id
     AND cs.status = 'active'
   ORDER BY cs.created_at DESC
   LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    SELECT name, slug, email_monthly_included, email_overage_price_eur
      INTO v_plan_name, v_plan_slug, v_plan_limit, v_plan_price
      FROM subscription_plans
     WHERE id = v_plan_id;
  END IF;

  -- 4b. Fetch per-company override row (service = 'email')
  SELECT custom_monthly_email_limit, price_per_unit_eur, is_free
    INTO v_override_limit, v_override_price, v_override_free
    FROM company_billing_overrides
   WHERE company_id = p_company_id
     AND service = 'email'
   LIMIT 1;

  v_effective_limit := COALESCE(v_override_limit, v_plan_limit, 0);
  v_effective_price := COALESCE(v_override_price, v_plan_price, 0.0015);

  -- 4c. Current-month usage from email_delivery_log
  v_month_start := date_trunc('month', now());
  SELECT COUNT(*)::INTEGER INTO v_sent_this_month
    FROM email_delivery_log
   WHERE company_id = p_company_id
     AND sent_at >= v_month_start
     AND status IN ('sent','delivered','queued');

  -- 4d. Wallet snapshot
  SELECT balance_eur, sends_blocked
    INTO v_wallet_balance, v_wallet_blocked
    FROM email_credits
   WHERE company_id = p_company_id
   LIMIT 1;

  RETURN jsonb_build_object(
    'company_id',          p_company_id,
    'plan_id',             v_plan_id,
    'plan_name',           v_plan_name,
    'plan_slug',           v_plan_slug,
    'plan_limit',          v_plan_limit,
    'plan_price_eur',      v_plan_price,
    'override_limit',      v_override_limit,
    'override_price_eur',  v_override_price,
    'is_free',             COALESCE(v_override_free, FALSE),
    'effective_limit',     v_effective_limit,
    'effective_price_eur', v_effective_price,
    'sent_this_month',     COALESCE(v_sent_this_month, 0),
    'remaining',           CASE
                             WHEN v_effective_limit = -1 THEN -1
                             ELSE GREATEST(0, v_effective_limit - COALESCE(v_sent_this_month, 0))
                           END,
    'over_quota',          CASE
                             WHEN v_effective_limit = -1 THEN FALSE
                             ELSE COALESCE(v_sent_this_month, 0) >= v_effective_limit
                           END,
    'wallet_balance_eur',  COALESCE(v_wallet_balance, 0),
    'wallet_sends_blocked',COALESCE(v_wallet_blocked, FALSE),
    'computed_at',         now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_email_quota(UUID) TO authenticated, service_role;

-- ── 5. Companion RPC: aggregated usage summary for super_admin UI ──────────
CREATE OR REPLACE FUNCTION public.get_company_email_usage_breakdown(
  p_company_id UUID,
  p_months     INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'per_month',
      (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.month DESC), '[]'::jsonb)
         FROM (
           SELECT date_trunc('month', sent_at) AS month,
                  COUNT(*)                     AS total,
                  SUM(CASE WHEN status IN ('sent','delivered') THEN 1 ELSE 0 END) AS delivered,
                  SUM(CASE WHEN status = 'failed'             THEN 1 ELSE 0 END) AS failed,
                  COALESCE(SUM(charged_eur), 0) AS charged_eur
             FROM email_delivery_log
            WHERE company_id = p_company_id
              AND sent_at >= date_trunc('month', now()) - (p_months || ' months')::INTERVAL
            GROUP BY 1
         ) t),
    'per_stream_current_month',
      (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
         FROM (
           SELECT COALESCE(stream, 'unknown') AS stream,
                  COUNT(*)                    AS total,
                  COALESCE(SUM(charged_eur),0) AS charged_eur
             FROM email_delivery_log
            WHERE company_id = p_company_id
              AND sent_at >= date_trunc('month', now())
            GROUP BY 1
         ) t)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_company_email_usage_breakdown(UUID, INTEGER) TO authenticated, service_role;

-- ── 6. RLS: allow super_admin to read/write company_billing_overrides ──────
-- (Existing policy is 'sa_only' USING clause; reaffirm WITH CHECK so inserts
--  from the super_admin UI succeed idempotently. Uses the canonical
--  public.has_role(user, role) helper + app_role enum.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'company_billing_overrides'
       AND policyname = 'sa_only_write'
  ) THEN
    CREATE POLICY sa_only_write ON public.company_billing_overrides
      FOR ALL
      USING      (public.has_role(auth.uid(), 'super_admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
  END IF;
END $$;
