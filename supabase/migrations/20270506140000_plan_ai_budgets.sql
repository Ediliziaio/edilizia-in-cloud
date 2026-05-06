-- MP-PRICE-01 — plan_ai_budgets + view consumo + RPC check_company_budget
--
-- Cap dinamici per piano sull'AI:
--   - soft cap (es. 80%) → downgrade modelli a economici
--   - hard cap (es. 100%) → block o auto-charge o require_topup
--   - PAYG packages per top-up over-cap
--
-- NOTA SCHEMA: companies non ha plan_key diretto, ma subscription_plan_id (FK)
-- → subscription_plans.slug. Il join viene fatto via slug.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) plan_ai_budgets (config SuperAdmin)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_ai_budgets (
  plan_key            text PRIMARY KEY,
  monthly_budget_eur  numeric(10,4) NOT NULL CHECK (monthly_budget_eur >= 0),
  soft_cap_pct        int NOT NULL DEFAULT 80 CHECK (soft_cap_pct BETWEEN 0 AND 100),
  hard_cap_pct        int NOT NULL DEFAULT 100 CHECK (hard_cap_pct BETWEEN soft_cap_pct AND 500),
  on_soft_cap         text NOT NULL DEFAULT 'downgrade_models'
                      CHECK (on_soft_cap IN ('downgrade_models','notify_only','block')),
  fallback_model_tier text DEFAULT 'standard',
  on_hard_cap         text NOT NULL DEFAULT 'require_topup'
                      CHECK (on_hard_cap IN ('require_topup','block','auto_charge')),
  payg_enabled        boolean NOT NULL DEFAULT true,
  payg_packages       jsonb NOT NULL DEFAULT '[
    {"price_eur": 29, "credits_eur": 29, "bonus_pct": 5},
    {"price_eur": 79, "credits_eur": 82, "bonus_pct": 4},
    {"price_eur": 199, "credits_eur": 215, "bonus_pct": 8}
  ]'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id)
);

-- Seed allineato ai subscription_plans.slug attuali (starter, pro, enterprise, scopri)
-- + plus/premium come placeholder per espansione futura
INSERT INTO public.plan_ai_budgets
  (plan_key, monthly_budget_eur, soft_cap_pct, hard_cap_pct, on_soft_cap, fallback_model_tier, on_hard_cap)
VALUES
  ('scopri',     2,   80, 100, 'downgrade_models', 'standard', 'block'),
  ('starter',    5,   80, 100, 'downgrade_models', 'standard', 'require_topup'),
  ('pro',        15,  80, 100, 'downgrade_models', 'standard', 'require_topup'),
  ('plus',       40,  80, 100, 'downgrade_models', 'standard', 'require_topup'),
  ('premium',    150, 90, 110, 'notify_only',      'standard', 'auto_charge'),
  ('enterprise', 500, 95, 200, 'notify_only',      'advanced', 'auto_charge')
ON CONFLICT (plan_key) DO UPDATE
  SET monthly_budget_eur = EXCLUDED.monthly_budget_eur,
      soft_cap_pct = EXCLUDED.soft_cap_pct,
      hard_cap_pct = EXCLUDED.hard_cap_pct,
      on_soft_cap = EXCLUDED.on_soft_cap,
      fallback_model_tier = EXCLUDED.fallback_model_tier,
      on_hard_cap = EXCLUDED.on_hard_cap;

ALTER TABLE public.plan_ai_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_ai_budgets_read ON public.plan_ai_budgets;
CREATE POLICY plan_ai_budgets_read ON public.plan_ai_budgets FOR SELECT USING (true);

DROP POLICY IF EXISTS plan_ai_budgets_admin ON public.plan_ai_budgets;
CREATE POLICY plan_ai_budgets_admin ON public.plan_ai_budgets FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.plan_ai_budgets IS
  'MP-PRICE-01: budget AI mensile per piano (FK logica via subscription_plans.slug).';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_plan_ai_budgets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_ai_budgets_updated_at ON public.plan_ai_budgets;
CREATE TRIGGER trg_plan_ai_budgets_updated_at
  BEFORE UPDATE ON public.plan_ai_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_ai_budgets_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) View consumo mensile per company (cap_status calcolato)
-- ────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.company_ai_usage_month;
CREATE VIEW public.company_ai_usage_month
WITH (security_invoker = true) AS
SELECT
  l.company_id,
  sp.slug AS plan_key,
  pb.monthly_budget_eur,
  pb.soft_cap_pct,
  pb.hard_cap_pct,
  pb.on_soft_cap,
  pb.on_hard_cap,
  date_trunc('month', l.created_at) as usage_month,
  SUM(l.cost_billed_eur) as total_billed_eur,
  SUM(l.cost_real_eur)   as total_real_eur,
  SUM(l.margin_eur)      as total_margin_eur,
  COUNT(*)               as call_count,
  ROUND((SUM(l.cost_billed_eur) / NULLIF(pb.monthly_budget_eur, 0) * 100)::numeric, 2) as usage_pct,
  CASE
    WHEN pb.monthly_budget_eur IS NULL OR pb.monthly_budget_eur = 0 THEN 'no_budget'
    WHEN SUM(l.cost_billed_eur) / pb.monthly_budget_eur * 100 >= pb.hard_cap_pct THEN 'hard_cap'
    WHEN SUM(l.cost_billed_eur) / pb.monthly_budget_eur * 100 >= pb.soft_cap_pct THEN 'soft_cap'
    ELSE 'ok'
  END as cap_status
FROM public.ai_call_ledger l
JOIN public.companies c ON c.id = l.company_id
LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
LEFT JOIN public.plan_ai_budgets pb ON pb.plan_key = sp.slug
WHERE l.status = 'success'
GROUP BY l.company_id, sp.slug, pb.monthly_budget_eur, pb.soft_cap_pct, pb.hard_cap_pct,
         pb.on_soft_cap, pb.on_hard_cap, date_trunc('month', l.created_at);

GRANT SELECT ON public.company_ai_usage_month TO authenticated, service_role;

COMMENT ON VIEW public.company_ai_usage_month IS
  'MP-PRICE-01: consumo AI mensile per company con calcolo automatico cap_status.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC check_company_budget (per precheck in aiRouter — MP-PRICE-02)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_company_budget(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'plan_key', plan_key,
    'budget_eur', monthly_budget_eur,
    'used_eur', total_billed_eur,
    'usage_pct', usage_pct,
    'cap_status', cap_status,
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

  -- Fallback: no consumo nel mese → ritorna ok con used=0
  IF v IS NULL THEN
    SELECT jsonb_build_object(
      'plan_key', sp.slug,
      'budget_eur', pb.monthly_budget_eur,
      'used_eur', 0,
      'usage_pct', 0,
      'cap_status', CASE WHEN pb.monthly_budget_eur IS NULL THEN 'no_budget' ELSE 'ok' END,
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

  RETURN COALESCE(v, jsonb_build_object('cap_status', 'no_company', 'usage_pct', 0));
END $$;

REVOKE ALL ON FUNCTION public.check_company_budget(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_company_budget(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_company_budget IS
  'MP-PRICE-01: ritorna stato budget AI corrente per la company. Usato dal precheck di aiRouter (MP-PRICE-02).';
