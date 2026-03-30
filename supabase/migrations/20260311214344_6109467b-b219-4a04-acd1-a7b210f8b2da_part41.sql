ALTER TABLE public.company_onboarding DROP CONSTRAINT IF EXISTS company_onboarding_assigned_cs_fkey,
  ADD CONSTRAINT company_onboarding_assigned_cs_fkey FOREIGN KEY (assigned_cs) REFERENCES auth.users(id) ON DELETE SET NULL;
