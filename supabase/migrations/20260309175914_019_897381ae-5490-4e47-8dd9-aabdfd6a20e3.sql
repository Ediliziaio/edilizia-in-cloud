-- 3. ALTER marketing_contacts: add attribution columns
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS attr_source text,
  ADD COLUMN IF NOT EXISTS attr_medium text,
  ADD COLUMN IF NOT EXISTS attr_campaign text,
  ADD COLUMN IF NOT EXISTS attr_content text,
  ADD COLUMN IF NOT EXISTS attr_model text DEFAULT 'last_touch';
