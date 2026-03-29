ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
