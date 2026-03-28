-- Add fiscal_code and vat_number to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS fiscal_code text;
