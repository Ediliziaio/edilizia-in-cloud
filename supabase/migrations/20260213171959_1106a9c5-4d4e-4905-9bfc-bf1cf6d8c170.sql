
-- Add new columns to suppliers table for detailed info and Italian/Foreign distinction
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_foreign boolean NOT NULL DEFAULT false;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS country text DEFAULT 'Italia';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS fiscal_code text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
