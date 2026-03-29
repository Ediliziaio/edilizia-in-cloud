-- 1. Add probability, expected_close_date, loss_reason, loss_notes to marketing_opportunities
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS probability integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS loss_notes text;
