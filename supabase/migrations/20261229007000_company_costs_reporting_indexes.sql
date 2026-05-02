-- Reporting and filtering indexes for the company costs module.
-- These indexes support the operational cost dashboard without changing existing data.

CREATE INDEX IF NOT EXISTS idx_company_costs_company_due_paid
ON public.company_costs (company_id, due_date, is_paid);

CREATE INDEX IF NOT EXISTS idx_company_costs_company_category_due
ON public.company_costs (company_id, category, due_date)
WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_costs_company_supplier_due
ON public.company_costs (company_id, supplier_id, due_date)
WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_costs_company_order_due
ON public.company_costs (company_id, order_id, due_date)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_costs_unpaid_due
ON public.company_costs (company_id, due_date)
WHERE is_paid = false;

COMMENT ON INDEX public.idx_company_costs_company_due_paid IS 'Speeds up cost period and payment status filters per tenant.';
COMMENT ON INDEX public.idx_company_costs_company_category_due IS 'Speeds up category-based cost reports per tenant.';
COMMENT ON INDEX public.idx_company_costs_company_supplier_due IS 'Speeds up supplier-based cost reports per tenant.';
COMMENT ON INDEX public.idx_company_costs_company_order_due IS 'Speeds up order margin and order-linked cost lookups per tenant.';
COMMENT ON INDEX public.idx_company_costs_unpaid_due IS 'Speeds up unpaid and overdue cost controls per tenant.';

NOTIFY pgrst, 'reload schema';
