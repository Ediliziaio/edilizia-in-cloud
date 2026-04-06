-- Fix: drop the onboarding trigger on user_roles that references NEW.company_id
-- (user_roles has no company_id column — the trigger was incorrectly applied)
DROP TRIGGER IF EXISTS trg_onboarding_team_member ON public.user_roles;

-- Also fix the create-company-staff edge function route by ensuring
-- the _trg_onboarding_team_member function is safe (won't error if called elsewhere)
CREATE OR REPLACE FUNCTION public._trg_onboarding_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- user_roles has no company_id column; this trigger is a no-op on this table
  RETURN NEW;
END;
$$;
