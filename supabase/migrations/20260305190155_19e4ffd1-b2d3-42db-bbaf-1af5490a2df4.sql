-- Performance indexes on company_id for RLS and query optimization
CREATE INDEX IF NOT EXISTS idx_orders_company_id ON public.orders(company_id);
