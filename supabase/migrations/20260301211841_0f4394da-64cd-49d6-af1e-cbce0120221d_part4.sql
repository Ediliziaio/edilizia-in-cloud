-- System health metrics table for API call tracking
CREATE TABLE IF NOT EXISTS public.system_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL, -- 'edge_function_call', 'api_error', 'auth_event'
  function_name text,
  status_code int,
  latency_ms int,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
