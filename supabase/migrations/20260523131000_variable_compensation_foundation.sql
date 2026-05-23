-- Generic variable compensation foundation.
-- Keeps the current order_salespeople model compatible while opening the domain
-- to technicians, partners, referrers, external teams and other beneficiaries.

CREATE TABLE IF NOT EXISTS public.compensation_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('salesperson', 'employee', 'external_team', 'supplier', 'partner', 'referrer', 'manual')),
  source_id UUID,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commerciale'
    CHECK (role IN ('commerciale', 'tecnico', 'capo_cantiere', 'call_center', 'partner', 'segnalatore', 'installatore', 'subappaltatore', 'fornitore', 'manuale')),
  email TEXT,
  phone TEXT,
  default_compensation_type TEXT
    CHECK (default_compensation_type IS NULL OR default_compensation_type IN ('fixed', 'percentage_sold', 'percentage_collected', 'percentage_margin', 'bonus', 'malus', 'manual')),
  default_compensation_value NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_compensation_beneficiaries_company_role
  ON public.compensation_beneficiaries(company_id, role, is_active);

DROP TRIGGER IF EXISTS update_compensation_beneficiaries_updated_at ON public.compensation_beneficiaries;
CREATE TRIGGER update_compensation_beneficiaries_updated_at
BEFORE UPDATE ON public.compensation_beneficiaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.order_variable_compensations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES public.compensation_beneficiaries(id) ON DELETE RESTRICT,
  legacy_order_salesperson_id UUID UNIQUE REFERENCES public.order_salespeople(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'commerciale',
  compensation_type TEXT NOT NULL
    CHECK (compensation_type IN ('fixed', 'percentage_sold', 'percentage_collected', 'percentage_margin', 'bonus', 'malus', 'manual')),
  compensation_value NUMERIC NOT NULL DEFAULT 0,
  basis TEXT NOT NULL DEFAULT 'sold'
    CHECK (basis IN ('sold', 'collected', 'margin', 'revenue_period', 'errors', 'manual')),
  rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  bonus_amount NUMERIC NOT NULL DEFAULT 0,
  deduction_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'estimated'
    CHECK (status IN ('estimated', 'matured', 'held', 'approval', 'payable', 'paid', 'disputed', 'cancelled')),
  maturity_reason TEXT,
  expected_payment_date DATE,
  paid_date DATE,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_variable_compensations_company_status
  ON public.order_variable_compensations(company_id, status, expected_payment_date);
CREATE INDEX IF NOT EXISTS idx_order_variable_compensations_order
  ON public.order_variable_compensations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_variable_compensations_beneficiary
  ON public.order_variable_compensations(beneficiary_id, status);

DROP TRIGGER IF EXISTS update_order_variable_compensations_updated_at ON public.order_variable_compensations;
CREATE TRIGGER update_order_variable_compensations_updated_at
BEFORE UPDATE ON public.order_variable_compensations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.compensation_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  beneficiary_id UUID REFERENCES public.compensation_beneficiaries(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  gross_total NUMERIC NOT NULL DEFAULT 0,
  deductions_total NUMERIC NOT NULL DEFAULT 0,
  net_total NUMERIC NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensation_settlements_company_period
  ON public.compensation_settlements(company_id, period_start, period_end, status);

DROP TRIGGER IF EXISTS update_compensation_settlements_updated_at ON public.compensation_settlements;
CREATE TRIGGER update_compensation_settlements_updated_at
BEFORE UPDATE ON public.compensation_settlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.compensation_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.compensation_settlements(id) ON DELETE CASCADE,
  order_variable_compensation_id UUID NOT NULL REFERENCES public.order_variable_compensations(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(settlement_id, order_variable_compensation_id)
);

ALTER TABLE public.compensation_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_variable_compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_settlement_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company staff can view compensation beneficiaries" ON public.compensation_beneficiaries;
CREATE POLICY "Company staff can view compensation beneficiaries"
ON public.compensation_beneficiaries FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can manage compensation beneficiaries" ON public.compensation_beneficiaries;
CREATE POLICY "Company staff can manage compensation beneficiaries"
ON public.compensation_beneficiaries FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_permission(auth.uid(), 'can_edit_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can view variable compensations" ON public.order_variable_compensations;
CREATE POLICY "Company staff can view variable compensations"
ON public.order_variable_compensations FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can manage variable compensations" ON public.order_variable_compensations;
CREATE POLICY "Company staff can manage variable compensations"
ON public.order_variable_compensations FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can view compensation settlements" ON public.compensation_settlements;
CREATE POLICY "Company staff can view compensation settlements"
ON public.compensation_settlements FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_forecast'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can manage compensation settlements" ON public.compensation_settlements;
CREATE POLICY "Company staff can manage compensation settlements"
ON public.compensation_settlements FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
)
WITH CHECK (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
);

DROP POLICY IF EXISTS "Company staff can view settlement items" ON public.compensation_settlement_items;
CREATE POLICY "Company staff can view settlement items"
ON public.compensation_settlement_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.compensation_settlements s
    WHERE s.id = compensation_settlement_items.settlement_id
      AND s.company_id = get_user_company_id(auth.uid())
      AND has_permission(auth.uid(), 'can_view_forecast'::text)
  )
);

DROP POLICY IF EXISTS "Company staff can manage settlement items" ON public.compensation_settlement_items;
CREATE POLICY "Company staff can manage settlement items"
ON public.compensation_settlement_items FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.compensation_settlements s
    WHERE s.id = compensation_settlement_items.settlement_id
      AND s.company_id = get_user_company_id(auth.uid())
      AND has_permission(auth.uid(), 'can_edit_orders'::text)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.compensation_settlements s
    WHERE s.id = compensation_settlement_items.settlement_id
      AND s.company_id = get_user_company_id(auth.uid())
      AND has_permission(auth.uid(), 'can_edit_orders'::text)
  )
);

DROP POLICY IF EXISTS "Super admins can manage compensation beneficiaries" ON public.compensation_beneficiaries;
CREATE POLICY "Super admins can manage compensation beneficiaries"
ON public.compensation_beneficiaries FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage variable compensations" ON public.order_variable_compensations;
CREATE POLICY "Super admins can manage variable compensations"
ON public.order_variable_compensations FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage compensation settlements" ON public.compensation_settlements;
CREATE POLICY "Super admins can manage compensation settlements"
ON public.compensation_settlements FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage settlement items" ON public.compensation_settlement_items;
CREATE POLICY "Super admins can manage settlement items"
ON public.compensation_settlement_items FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.compensation_beneficiaries (
  company_id, source_type, source_id, display_name, role, email, phone,
  default_compensation_type, default_compensation_value, is_active, metadata
)
SELECT
  s.company_id,
  'salesperson',
  s.id,
  trim(concat_ws(' ', s.first_name, s.last_name)),
  'commerciale',
  s.email,
  s.phone,
  s.commission_type,
  s.commission_value,
  s.is_active,
  jsonb_build_object('legacy_salesperson_id', s.id, 'compensation_mode', COALESCE(s.compensation_mode, 'only_commission'))
FROM public.salespeople s
ON CONFLICT (company_id, source_type, source_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    default_compensation_type = EXCLUDED.default_compensation_type,
    default_compensation_value = EXCLUDED.default_compensation_value,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.order_variable_compensations (
  company_id, order_id, beneficiary_id, legacy_order_salesperson_id, role,
  compensation_type, compensation_value, basis, rule_snapshot,
  gross_amount, deduction_amount, net_amount, status, expected_payment_date, paid_date
)
SELECT
  o.company_id,
  os.order_id,
  cb.id,
  os.id,
  'commerciale',
  os.commission_type,
  os.commission_value,
  CASE
    WHEN os.commission_type = 'percentage_collected' THEN 'collected'
    WHEN os.commission_type = 'fixed' THEN 'manual'
    ELSE 'sold'
  END,
  jsonb_build_object(
    'legacy_order_salesperson_id', os.id,
    'commission_type', os.commission_type,
    'commission_value', os.commission_value,
    'created_from', 'order_salespeople'
  ),
  COALESCE(os.commission_amount, 0),
  COALESCE(os.deduction_amount, 0),
  GREATEST(0, COALESCE(os.commission_amount, 0) - COALESCE(os.deduction_amount, 0)),
  CASE
    WHEN COALESCE(os.is_paid, false) THEN 'paid'
    WHEN GREATEST(0, COALESCE(os.commission_amount, 0) - COALESCE(os.deduction_amount, 0)) = 0 THEN 'held'
    ELSE 'payable'
  END,
  os.payment_expected_date,
  os.paid_date
FROM public.order_salespeople os
JOIN public.orders o ON o.id = os.order_id
JOIN public.compensation_beneficiaries cb
  ON cb.company_id = o.company_id
 AND cb.source_type = 'salesperson'
 AND cb.source_id = os.salesperson_id
ON CONFLICT (legacy_order_salesperson_id) DO UPDATE
SET gross_amount = EXCLUDED.gross_amount,
    deduction_amount = EXCLUDED.deduction_amount,
    net_amount = EXCLUDED.net_amount,
    status = EXCLUDED.status,
    expected_payment_date = EXCLUDED.expected_payment_date,
    paid_date = EXCLUDED.paid_date,
    legacy_order_salesperson_id = EXCLUDED.legacy_order_salesperson_id,
    updated_at = now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_beneficiaries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_variable_compensations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_settlement_items TO authenticated;
