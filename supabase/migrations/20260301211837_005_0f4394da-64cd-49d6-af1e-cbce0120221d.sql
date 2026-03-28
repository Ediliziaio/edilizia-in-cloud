CREATE INDEX idx_health_metrics_lookup ON public.system_health_metrics(metric_type, recorded_at DESC);
