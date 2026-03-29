ALTER TABLE public.referrers ADD CONSTRAINT referrers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
