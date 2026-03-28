-- Step 1: Add missing click ID columns to form_submissions
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS ttclid TEXT,
  ADD COLUMN IF NOT EXISTS msclkid TEXT,
  ADD COLUMN IF NOT EXISTS li_fat_id TEXT;
