ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_created_by_fkey,
  ADD CONSTRAINT invoice_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
