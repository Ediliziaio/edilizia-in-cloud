-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_team_tasks boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_permissions.can_view_team_tasks IS
  'Vede le attività (task) di tutto il team nella pagina Attività; false = solo le proprie. Scoping UI: la sicurezza dura è only_assigned.';
