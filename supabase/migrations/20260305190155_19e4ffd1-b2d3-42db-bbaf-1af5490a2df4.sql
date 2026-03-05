
-- Performance indexes on company_id for RLS and query optimization
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON public.orders(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_id ON public.marketing_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_company_id ON public.appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON public.suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_company_costs_company_id ON public.company_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_company_id ON public.warehouse_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunities_company_id ON public.marketing_opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_salespeople_company_id ON public.salespeople(company_id);
CREATE INDEX IF NOT EXISTS idx_external_teams_company_id ON public.external_teams(company_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_employee_id ON public.work_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_salespeople_order_id ON public.order_salespeople(order_id);

-- Helper function for efficient company_id lookups in RLS
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;
