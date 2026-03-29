-- 2. Add recurrence columns to company_costs (if not existing)
ALTER TABLE public.company_costs 
  ADD COLUMN IF NOT EXISTS recurrence_auto BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
