-- 4. ALTER companies — add AI credit columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_piano text DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS ai_crediti numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_crediti_bonus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_crediti_soglia_allerta numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ai_rinnovo_at timestamptz;
