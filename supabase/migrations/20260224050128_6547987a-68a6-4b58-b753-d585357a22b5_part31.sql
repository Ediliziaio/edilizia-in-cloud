-- 7. integration_webhook_events (event inbox/queue)
CREATE TABLE public.integration_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  event_type TEXT NOT NULL DEFAULT 'leadgen',
  event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  fail_count INT NOT NULL DEFAULT 0,
  last_fail_reason TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  UNIQUE(company_id, provider, event_id)
);
