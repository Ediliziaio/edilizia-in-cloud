CREATE INDEX idx_scadenze_cost ON public.scadenze(cost_id) WHERE cost_id IS NOT NULL;
