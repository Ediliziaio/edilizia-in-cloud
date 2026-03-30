ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS bank_iban text,
ADD COLUMN IF NOT EXISTS bank_account_holder text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS payment_notes text;