-- Company-level commission rules.
-- These rules are the configurable layer above per-salesperson defaults.

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  scope TEXT NOT NULL DEFAULT 'company' CHECK (scope IN ('company', 'salesperson', 'order')),
  salesperson_id UUID REFERENCES public.salespeople(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('base', 'tier', 'bonus', 'malus', 'hold', 'payment_policy', 'quality')),
  basis TEXT NOT NULL DEFAULT 'sold' CHECK (basis IN ('sold', 'collected', 'margin', 'revenue_period', 'errors', 'manual')),
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_prompt TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_company_priority
  ON public.commission_rules(company_id, is_active DESC, priority ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_rules_salesperson
  ON public.commission_rules(salesperson_id)
  WHERE salesperson_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_commission_rules_updated_at ON public.commission_rules;
CREATE TRIGGER update_commission_rules_updated_at
BEFORE UPDATE ON public.commission_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins can manage commission rules" ON public.commission_rules;
CREATE POLICY "Company admins can manage commission rules"
ON public.commission_rules FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can view commission rules if permitted" ON public.commission_rules;
CREATE POLICY "Staff can view commission rules if permitted"
ON public.commission_rules FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can manage commission rules if permitted" ON public.commission_rules;
CREATE POLICY "Staff can manage commission rules if permitted"
ON public.commission_rules FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_permission(auth.uid(), 'can_edit_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admins can manage commission rules" ON public.commission_rules;
CREATE POLICY "Super admins can manage commission rules"
ON public.commission_rules FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
