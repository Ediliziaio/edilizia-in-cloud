-- Add click ID and device columns to form_submissions
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS fbclid TEXT;
