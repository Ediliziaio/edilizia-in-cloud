ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_revoked_by_fkey,
  ADD CONSTRAINT user_sessions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
