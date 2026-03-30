ALTER TABLE public.prima_nota_entries DROP CONSTRAINT IF EXISTS prima_nota_entries_created_by_fkey,
  ADD CONSTRAINT prima_nota_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
