ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey,
  ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
