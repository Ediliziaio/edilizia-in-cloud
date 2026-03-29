ALTER TABLE public.multi_company_access ADD CONSTRAINT multi_company_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
