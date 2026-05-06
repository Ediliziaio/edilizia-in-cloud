-- MP-PRICE-01 — PAYG Top-ups + view distribuzione per persona + tabella alert
-- ════════════════════════════════════════════════════════════════════════════
-- Schema base plan_ai_budgets + company_ai_usage_month + RPC check_company_budget
-- è stato creato in 20270506140000_plan_ai_budgets.sql.
--
-- Questo MP aggiunge:
--   • ai_payg_topups: storia top-up Stripe over-cap
--   • company_ai_usage_by_persona_month: view distribuzione persona/mese
--   • check_company_budget_v2: RPC con budget effettivo (incluso PAYG)
--   • ai_usage_alerts_log: dedupe alert mensili
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) ai_payg_topups
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_payg_topups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  package_price_eur numeric(10,2) NOT NULL CHECK (package_price_eur > 0),
  credits_eur       numeric(10,4) NOT NULL CHECK (credits_eur > 0),
  bonus_pct         numeric(5,2) DEFAULT 0,

  -- Stripe integration
  stripe_payment_intent_id text,
  stripe_charge_id  text,
  stripe_invoice_id text,

  -- Stato
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','refunded')),

  -- Quando è stato applicato al saldo
  applied_at      timestamptz,
  failed_reason   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payg_topups_company_date
  ON public.ai_payg_topups(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payg_topups_status
  ON public.ai_payg_topups(status, created_at DESC) WHERE status <> 'succeeded';
CREATE INDEX IF NOT EXISTS idx_payg_topups_stripe
  ON public.ai_payg_topups(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.ai_payg_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topups_company_read ON public.ai_payg_topups;
CREATE POLICY topups_company_read ON public.ai_payg_topups FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS topups_admin ON public.ai_payg_topups;
CREATE POLICY topups_admin ON public.ai_payg_topups FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS topups_super_admin ON public.ai_payg_topups;
CREATE POLICY topups_super_admin ON public.ai_payg_topups FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_payg_topups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_payg_topups_updated_at ON public.ai_payg_topups;
CREATE TRIGGER trg_payg_topups_updated_at
  BEFORE UPDATE ON public.ai_payg_topups
  FOR EACH ROW EXECUTE FUNCTION public.tg_payg_topups_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) View distribuzione consumo per persona/mese
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.company_ai_usage_by_persona_month
WITH (security_invoker = true) AS
SELECT
  l.company_id,
  l.persona_key,
  date_trunc('month', l.created_at) AS usage_month,
  SUM(l.cost_billed_eur) AS cost_eur,
  COUNT(*) AS call_count,
  AVG(l.duration_ms) AS avg_duration_ms
FROM public.ai_call_ledger l
WHERE l.persona_key IS NOT NULL AND l.status = 'success'
GROUP BY l.company_id, l.persona_key, date_trunc('month', l.created_at);

GRANT SELECT ON public.company_ai_usage_by_persona_month TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: check_company_budget_v2 (con PAYG topups inclusi)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_company_budget_v2(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_topups_eur numeric;
  v_effective_budget numeric;
  v_used_eur numeric;
  v_usage_pct numeric;
  v_cap_status text;
BEGIN
  -- Carica usage base
  SELECT jsonb_build_object(
    'plan_key', plan_key,
    'budget_eur', monthly_budget_eur,
    'used_eur', total_billed_eur,
    'usage_pct', usage_pct,
    'soft_cap_pct', soft_cap_pct,
    'hard_cap_pct', hard_cap_pct,
    'on_soft_cap', on_soft_cap,
    'on_hard_cap', on_hard_cap,
    'usage_month', usage_month
  ) INTO v
    FROM public.company_ai_usage_month
   WHERE company_id = p_company_id
     AND usage_month = date_trunc('month', NOW())
   LIMIT 1;

  -- Fallback se nessun consumo questo mese
  IF v IS NULL THEN
    SELECT jsonb_build_object(
      'plan_key', sp.slug,
      'budget_eur', pb.monthly_budget_eur,
      'used_eur', 0,
      'usage_pct', 0,
      'soft_cap_pct', pb.soft_cap_pct,
      'hard_cap_pct', pb.hard_cap_pct,
      'on_soft_cap', pb.on_soft_cap,
      'on_hard_cap', pb.on_hard_cap,
      'usage_month', date_trunc('month', NOW())
    ) INTO v
      FROM public.companies c
      LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
      LEFT JOIN public.plan_ai_budgets pb ON pb.plan_key = sp.slug
     WHERE c.id = p_company_id
     LIMIT 1;
  END IF;

  -- Somma top-up PAYG mese corrente
  SELECT COALESCE(SUM(credits_eur), 0) INTO v_topups_eur
    FROM public.ai_payg_topups
   WHERE company_id = p_company_id
     AND status = 'succeeded'
     AND applied_at >= date_trunc('month', NOW());

  -- Ricalcola con topups
  v_effective_budget := COALESCE((v->>'budget_eur')::numeric, 0) + v_topups_eur;
  v_used_eur := COALESCE((v->>'used_eur')::numeric, 0);
  v_usage_pct := CASE
    WHEN v_effective_budget = 0 THEN 0
    ELSE ROUND((v_used_eur / v_effective_budget * 100)::numeric, 2)
  END;

  v_cap_status := CASE
    WHEN v_effective_budget = 0 THEN 'no_budget'
    WHEN v_usage_pct >= COALESCE((v->>'hard_cap_pct')::int, 100) THEN 'hard_cap'
    WHEN v_usage_pct >= COALESCE((v->>'soft_cap_pct')::int, 80) THEN 'soft_cap'
    ELSE 'ok'
  END;

  RETURN COALESCE(v, '{}'::jsonb) || jsonb_build_object(
    'topups_eur', v_topups_eur,
    'effective_budget_eur', v_effective_budget,
    'effective_usage_pct', v_usage_pct,
    'effective_cap_status', v_cap_status
  );
END $$;

REVOKE ALL ON FUNCTION public.check_company_budget_v2(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_company_budget_v2(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_company_budget_v2 IS
  'MP-PRICE-01: budget effettivo includendo PAYG topups. Usato dal precheck di aiRouter.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ai_usage_alerts_log: dedupe alert (1 per (company, threshold, month))
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage_alerts_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  threshold_pct int NOT NULL,
  alert_month   date NOT NULL,  -- primo del mese
  channel       text NOT NULL CHECK (channel IN ('in_app','email','whatsapp','sms','telegram')),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_alert_dedupe UNIQUE (company_id, threshold_pct, alert_month, channel)
);

CREATE INDEX IF NOT EXISTS idx_alerts_log_company_month
  ON public.ai_usage_alerts_log(company_id, alert_month DESC);

ALTER TABLE public.ai_usage_alerts_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alerts_log_company ON public.ai_usage_alerts_log;
CREATE POLICY alerts_log_company ON public.ai_usage_alerts_log FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS alerts_log_super_admin ON public.ai_usage_alerts_log;
CREATE POLICY alerts_log_super_admin ON public.ai_usage_alerts_log FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
