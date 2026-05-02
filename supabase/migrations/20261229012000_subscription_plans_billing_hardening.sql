-- Hardening Admin / Piani SaaS:
-- - vincoli economici coerenti anche da API/script
-- - indici per lista admin, usage e lookup pricing
-- I CHECK sono NOT VALID per non bloccare deploy su eventuali dati storici
-- già incoerenti; i nuovi/aggiornati vengono comunque protetti.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_price_monthly_nonnegative') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_price_monthly_nonnegative
      CHECK (price_monthly >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_price_yearly_nonnegative') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_price_yearly_nonnegative
      CHECK (price_yearly >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_max_orders_valid') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_max_orders_valid
      CHECK (max_orders = -1 OR max_orders >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_max_users_valid') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_max_users_valid
      CHECK (max_users = -1 OR max_users >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_storage_nonnegative') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_storage_nonnegative
      CHECK (max_storage_mb >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_trial_days_range') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_trial_days_range
      CHECK (trial_days BETWEEN 0 AND 365) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_position_nonnegative') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_position_nonnegative
      CHECK (position >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_slug_format') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_slug_format
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_features_array') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_features_array
      CHECK (features IS NULL OR jsonb_typeof(features) = 'array') NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_plans_included_modules_array') THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_included_modules_array
      CHECK (included_modules IS NULL OR jsonb_typeof(included_modules) = 'array') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_slug_unique
  ON public.subscription_plans (slug);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_position
  ON public.subscription_plans (is_active, position);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_price_monthly
  ON public.subscription_plans (price_monthly);

CREATE INDEX IF NOT EXISTS idx_companies_subscription_plan_id
  ON public.companies (subscription_plan_id)
  WHERE subscription_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_plan_id
  ON public.company_subscriptions (plan_id)
  WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_logs_plan_refs
  ON public.subscription_logs (plan_id, previous_plan_id);
