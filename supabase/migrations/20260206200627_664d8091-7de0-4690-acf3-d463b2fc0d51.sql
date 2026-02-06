-- Add expected dates for deposits
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS deposit_expected_date DATE,
ADD COLUMN IF NOT EXISTS deposit_2_expected_date DATE;