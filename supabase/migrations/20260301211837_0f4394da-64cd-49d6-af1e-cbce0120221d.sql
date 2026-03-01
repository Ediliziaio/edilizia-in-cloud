
-- Rate limiting table for sensitive edge functions
CREATE TABLE public.edge_function_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  caller_id text NOT NULL, -- user_id or IP
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_lookup ON public.edge_function_rate_limits(function_name, caller_id, called_at DESC);

-- Auto-cleanup: delete entries older than 1 hour
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.edge_function_rate_limits
  WHERE called_at < now() - interval '1 hour';
$$;

-- RLS: only service role can access (edge functions use service role)
ALTER TABLE public.edge_function_rate_limits ENABLE ROW LEVEL SECURITY;

-- System health metrics table for API call tracking
CREATE TABLE public.system_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL, -- 'edge_function_call', 'api_error', 'auth_event'
  function_name text,
  status_code int,
  latency_ms int,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_metrics_lookup ON public.system_health_metrics(metric_type, recorded_at DESC);
CREATE INDEX idx_health_metrics_function ON public.system_health_metrics(function_name, recorded_at DESC);

ALTER TABLE public.system_health_metrics ENABLE ROW LEVEL SECURITY;

-- Super admins can read health metrics
CREATE POLICY "Super admins read health metrics"
ON public.system_health_metrics FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Add new audit actions for plan changes
-- (The admin_audit_log table already exists and is flexible with action field)
