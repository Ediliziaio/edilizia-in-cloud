
-- API Keys table
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  rate_limit_per_day integer NOT NULL DEFAULT 10000,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- API usage log
CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code integer NOT NULL DEFAULT 200,
  response_time_ms integer,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Daily aggregated stats
CREATE TABLE public.api_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_requests integer NOT NULL DEFAULT 0,
  successful_requests integer NOT NULL DEFAULT 0,
  failed_requests integer NOT NULL DEFAULT 0,
  avg_response_time_ms integer,
  UNIQUE(api_key_id, date)
);

-- Indexes
CREATE INDEX idx_api_keys_company ON public.api_keys(company_id);
CREATE INDEX idx_api_keys_key_prefix ON public.api_keys(key_prefix);
CREATE INDEX idx_api_usage_log_key ON public.api_usage_log(api_key_id, created_at DESC);
CREATE INDEX idx_api_usage_log_company ON public.api_usage_log(company_id, created_at DESC);
CREATE INDEX idx_api_usage_daily_key ON public.api_usage_daily(api_key_id, date DESC);
CREATE INDEX idx_api_usage_daily_company ON public.api_usage_daily(company_id, date DESC);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_daily ENABLE ROW LEVEL SECURITY;

-- Policies for api_keys
CREATE POLICY "Company admins manage own api keys"
ON public.api_keys FOR ALL TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Policies for api_usage_log
CREATE POLICY "Company reads own api usage"
ON public.api_usage_log FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Policies for api_usage_daily
CREATE POLICY "Company reads own api daily stats"
ON public.api_usage_daily FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
