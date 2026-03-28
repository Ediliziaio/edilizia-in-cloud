CREATE INDEX IF NOT EXISTS idx_orders_company_created ON public.orders (company_id, created_at DESC);
