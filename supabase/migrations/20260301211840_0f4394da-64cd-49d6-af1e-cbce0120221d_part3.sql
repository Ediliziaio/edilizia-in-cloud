-- RLS: only service role can access (edge functions use service role)
ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;
