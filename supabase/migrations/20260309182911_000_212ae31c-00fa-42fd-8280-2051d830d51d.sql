-- Add is_active to lead_forms
ALTER TABLE public.lead_forms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
