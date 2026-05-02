-- Performance indexes for the cash-flow forecast module.
-- They support rolling forecast filters, open deadlines, and banking/invoice summaries.

CREATE INDEX IF NOT EXISTS idx_order_installments_expected_unpaid
ON public.order_installments (expected_date, order_id)
WHERE is_paid = false;

CREATE INDEX IF NOT EXISTS idx_scadenze_company_status_due_direction
ON public.scadenze (company_id, status, due_date, direction);

CREATE INDEX IF NOT EXISTS idx_company_costs_company_unpaid_due_forecast
ON public.company_costs (company_id, due_date)
WHERE is_paid = false;

CREATE INDEX IF NOT EXISTS idx_invoices_company_status_forecast
ON public.invoices (company_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_status_forecast
ON public.purchase_orders (company_id, status);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_active_forecast
ON public.bank_accounts (company_id, is_active);

COMMENT ON INDEX public.idx_order_installments_expected_unpaid IS 'Speeds up unpaid installment lookups used by cash-flow forecast.';
COMMENT ON INDEX public.idx_scadenze_company_status_due_direction IS 'Speeds up open deadline filtering for forecast income and expenses.';
COMMENT ON INDEX public.idx_company_costs_company_unpaid_due_forecast IS 'Speeds up unpaid company cost lookups for the forecast horizon.';
COMMENT ON INDEX public.idx_invoices_company_status_forecast IS 'Speeds up pending invoice summaries in the forecast header.';
COMMENT ON INDEX public.idx_purchase_orders_company_status_forecast IS 'Speeds up pending purchase order summaries in the forecast header.';
COMMENT ON INDEX public.idx_bank_accounts_company_active_forecast IS 'Speeds up active bank account balance summaries.';

NOTIFY pgrst, 'reload schema';
