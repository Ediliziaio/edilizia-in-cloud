-- 6. integration_webhook_subscriptions
CREATE TABLE public.integration_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  object TEXT NOT NULL DEFAULT 'page',
  fields JSONB DEFAULT '["leadgen"]'::jsonb,
  callback_url TEXT,
  verify_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
