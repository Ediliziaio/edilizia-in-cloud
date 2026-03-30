CREATE TABLE IF NOT EXISTS public.company_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  feature_key TEXT REFERENCES public.platform_feature_flags(key) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  override_reason TEXT,
  override_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, feature_key)
);
