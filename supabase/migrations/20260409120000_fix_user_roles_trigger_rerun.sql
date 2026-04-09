-- FIX CRITICO (rerun): la migration precedente con timestamp 20260406130000
-- ha timestamp PRECEDENTE a 20260720000000_onboarding_auto_complete_triggers.sql
-- che ricrea il trigger rotto. Supabase applica le migration in ordine di versione,
-- quindi in produzione il trigger _trg_onboarding_team_member è ancora attivo e
-- referenzia NEW.company_id, colonna inesistente su public.user_roles.
-- Conseguenza: OGNI insert in user_roles fallisce → impossibile creare nuovi utenti
-- (employee, salesperson, platform user, company staff).
--
-- Questa migration (timestamp 2026-04-09) drop definitivamente il trigger
-- e rende la funzione un no-op sicuro.

DROP TRIGGER IF EXISTS trg_onboarding_team_member ON public.user_roles;

CREATE OR REPLACE FUNCTION public._trg_onboarding_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- user_roles non ha company_id: trigger disabilitato permanentemente.
  -- L'onboarding step 'add_team_member' viene completato lato edge function
  -- dopo la creazione dell'utente (create-employee-user, manage-platform-users).
  RETURN NEW;
END;
$$;
