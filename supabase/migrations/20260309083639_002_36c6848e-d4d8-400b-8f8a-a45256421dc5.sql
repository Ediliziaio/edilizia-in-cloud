-- 3. Add is_case_sensitive to bank_categorization_rules
ALTER TABLE public.bank_categorization_rules ADD COLUMN IF NOT EXISTS is_case_sensitive boolean NOT NULL DEFAULT false;
