-- Attività per ruolo: nuovo permesso granulare "Attività del team".
-- Default FALSE → ogni utente non-admin atterra sulle SOLE proprie attività
-- (task) nella pagina /azienda/attivita; l'admin concede la visione team a chi
-- coordina (capo ufficio, responsabile commerciale, ecc.).
-- NB: è scoping UX, non una barriera dura — la leva di sicurezza dura resta
-- staff_permissions.only_assigned (enforcement RLS via check_staff_visibility).
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_team_tasks boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_permissions.can_view_team_tasks IS
  'Vede le attività (task) di tutto il team nella pagina Attività; false = solo le proprie. Scoping UI: la sicurezza dura è only_assigned.';
