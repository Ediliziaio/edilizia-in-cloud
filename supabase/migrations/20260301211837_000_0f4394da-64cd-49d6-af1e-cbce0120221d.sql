-- Rate limiting table for sensitive edge functions
CREATE TABLE public.edge_function_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  caller_id text NOT NULL, -- user_id or IP
  called_at timestamptz NOT NULL DEFAULT now()
);
