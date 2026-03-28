ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
