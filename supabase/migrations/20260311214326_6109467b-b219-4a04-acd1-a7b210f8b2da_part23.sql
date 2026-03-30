ALTER TABLE public.scadenze DROP CONSTRAINT IF EXISTS scadenze_created_by_fkey,
  ADD CONSTRAINT scadenze_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
