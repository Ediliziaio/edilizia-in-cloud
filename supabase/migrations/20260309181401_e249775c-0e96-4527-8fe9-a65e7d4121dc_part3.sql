-- Step 2: Add missing columns to contact_attributions
ALTER TABLE public.contact_attributions
  ADD COLUMN IF NOT EXISTS ft_content TEXT,
  ADD COLUMN IF NOT EXISTS ft_term TEXT,
  ADD COLUMN IF NOT EXISTS ft_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_gclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_ttclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_landing_url TEXT,
  ADD COLUMN IF NOT EXISTS lt_content TEXT,
  ADD COLUMN IF NOT EXISTS lt_term TEXT,
  ADD COLUMN IF NOT EXISTS lt_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_gclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_ttclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_landing_url TEXT;
