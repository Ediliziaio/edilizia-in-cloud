-- Fix retrocompatibilità: rinomina ruolo 'worker' → 'employee'
-- Aggiorna eventuali utenti già creati con ruolo 'worker' nel DB.
-- In alcuni ambienti puliti l'enum app_role non ha mai avuto 'worker':
-- confrontare role = 'worker' in quel caso rompe tutta la migration chain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'worker'
  ) THEN
    UPDATE public.user_roles
    SET role = 'employee'
    WHERE role = 'worker'::public.app_role;
  END IF;
END $$;

-- Se il valore 'worker' esiste in ambienti storici, rimane nell'enum per
-- evitare incompatibilità; nei database nuovi viene semplicemente ignorato.
