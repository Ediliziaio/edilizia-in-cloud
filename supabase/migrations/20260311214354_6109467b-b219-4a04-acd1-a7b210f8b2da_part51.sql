ALTER TABLE public.internal_call_logs ADD CONSTRAINT internal_call_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;
