ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS allocations JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.company_costs.allocations IS
  'Array di {order_id, pct} per allocazione costi fissi a commesse.';
