-- =============================================
-- Meta Lead Ads Integration Tables
-- =============================================

-- 1. integrations (generic, supports multiple providers)
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_by UUID,
  last_sync_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  health TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider)
);
