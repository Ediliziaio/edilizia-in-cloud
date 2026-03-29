ALTER TABLE public.companies ADD CONSTRAINT companies_white_label_enabled_by_fkey FOREIGN KEY (white_label_enabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
