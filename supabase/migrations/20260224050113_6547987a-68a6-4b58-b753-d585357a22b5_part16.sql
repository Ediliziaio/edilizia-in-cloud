-- 4. meta_lead_forms
CREATE TABLE public.meta_lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  page_asset_id UUID REFERENCES public.meta_assets(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  sync_mode TEXT NOT NULL DEFAULT 'new_only',
  since_date TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, form_id)
);
