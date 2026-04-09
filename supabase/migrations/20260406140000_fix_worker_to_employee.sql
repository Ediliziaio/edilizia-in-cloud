-- Fix retrocompatibilità: rinomina ruolo 'worker' → 'employee'
-- Aggiorna eventuali utenti già creati con ruolo 'worker' nel DB
UPDATE public.user_roles
SET role = 'employee'
WHERE role = 'worker';

-- Il valore 'worker' rimane nell'enum app_role per evitare errori,
-- ma non sarà più usato dal codice frontend.
