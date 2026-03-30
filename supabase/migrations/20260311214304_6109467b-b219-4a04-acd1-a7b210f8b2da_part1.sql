ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_user_id_fkey,
  ADD CONSTRAINT referrers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
