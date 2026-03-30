CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.edge_function_rate_limits(function_name, caller_id, called_at DESC);
