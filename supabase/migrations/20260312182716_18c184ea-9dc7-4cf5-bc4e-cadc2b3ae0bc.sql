ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS billing_mode_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_mode_set_by UUID;
