-- user_sessions.revoked_by
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_revoked_by_fkey;
