CREATE INDEX IF NOT EXISTS idx_health_metrics_function ON public.system_health_metrics(function_name, recorded_at DESC);
