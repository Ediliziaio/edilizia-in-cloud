-- 2. integration_credentials (encrypted token store)
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  granted_scopes JSONB DEFAULT '[]'::jsonb,
  meta_user_id TEXT,
  meta_user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
