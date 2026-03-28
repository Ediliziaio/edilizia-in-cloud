-- 2) Aggiungere colonne dunning a companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_failure_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dunning_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_started_at timestamptz;
