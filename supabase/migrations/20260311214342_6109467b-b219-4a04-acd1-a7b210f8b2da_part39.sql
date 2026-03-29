ALTER TABLE public.company_addons_log ADD CONSTRAINT company_addons_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
