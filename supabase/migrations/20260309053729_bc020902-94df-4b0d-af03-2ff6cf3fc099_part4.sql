-- Password complexity columns on companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS password_min_length integer NOT NULL DEFAULT 8,
ADD COLUMN IF NOT EXISTS password_require_uppercase boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS password_require_numbers boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS password_require_special boolean NOT NULL DEFAULT false;
