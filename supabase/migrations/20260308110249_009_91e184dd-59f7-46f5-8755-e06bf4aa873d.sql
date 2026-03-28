-- 3. Add columns to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS segment_json jsonb,
  ADD COLUMN IF NOT EXISTS credits_used numeric NOT NULL DEFAULT 0;
