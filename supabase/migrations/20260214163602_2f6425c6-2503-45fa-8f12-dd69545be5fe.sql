ALTER TABLE public.companies
ADD COLUMN payment_method text NOT NULL DEFAULT 'none',
ADD COLUMN bank_iban text,
ADD COLUMN bank_account_holder text,
ADD COLUMN bank_name text,
ADD COLUMN payment_notes text;