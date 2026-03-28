-- 2. New columns on companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS enforce_2fa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allowed_ips TEXT[],
  ADD COLUMN IF NOT EXISTS password_expiry_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_failed_attempts INT NOT NULL DEFAULT 5;
