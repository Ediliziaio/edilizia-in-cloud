-- Add unique constraint on badge_id per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_profili_badge_id ON public.hr_profili(company_id, badge_id) WHERE badge_id IS NOT NULL;
