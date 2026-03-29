ALTER TABLE public.inventory_audits ADD CONSTRAINT inventory_audits_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
