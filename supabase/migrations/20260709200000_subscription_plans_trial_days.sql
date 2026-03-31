-- Migration: add trial_days to subscription_plans
-- Used by create-company to calculate trial_ends_at dynamically per plan.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 14;

-- Update existing plans to have 14-day trial
UPDATE public.subscription_plans SET trial_days = 14 WHERE trial_days IS NULL;
