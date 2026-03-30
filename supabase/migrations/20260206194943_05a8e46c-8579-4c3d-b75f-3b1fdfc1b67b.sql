-- Nuovi campi per stato pagamenti
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deposit_paid_date DATE,
ADD COLUMN IF NOT EXISTS deposit_2_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deposit_2_paid_date DATE,
ADD COLUMN IF NOT EXISTS balance_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS balance_paid_date DATE,
ADD COLUMN IF NOT EXISTS balance_expected_date DATE;