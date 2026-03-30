ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_client_id_fkey,
  ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;
