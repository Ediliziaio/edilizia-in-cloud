CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
  ON public.admin_sessions(user_id, last_seen_at DESC);
