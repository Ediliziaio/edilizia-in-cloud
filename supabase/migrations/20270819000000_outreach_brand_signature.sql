ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS footer_address text;
