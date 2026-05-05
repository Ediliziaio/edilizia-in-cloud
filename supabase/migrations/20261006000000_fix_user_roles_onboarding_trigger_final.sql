-- FIX DEFINITIVO: public.user_roles non ha company_id.
-- Una migration successiva ricrea _trg_onboarding_team_member usando NEW.company_id
-- e il trigger trg_onboarding_team_member su user_roles, rompendo gli insert dei ruoli.

DROP TRIGGER IF EXISTS trg_onboarding_team_member ON public.user_roles;

CREATE OR REPLACE FUNCTION public._trg_onboarding_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- user_roles non espone company_id: la gestione onboarding team resta a carico
  -- delle edge function che conoscono azienda/utente creato.
  RETURN NEW;
END;
$$;
