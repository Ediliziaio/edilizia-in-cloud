-- Interruttore: applica automaticamente il Playbook commessa alle NUOVE commesse.
-- Additivo + idempotente. Default false (nessun cambio di comportamento esistente).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS playbook_auto_apply boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.playbook_auto_apply IS
  'Se true, alla creazione di una commessa vengono generate automaticamente le attività del Playbook.';
