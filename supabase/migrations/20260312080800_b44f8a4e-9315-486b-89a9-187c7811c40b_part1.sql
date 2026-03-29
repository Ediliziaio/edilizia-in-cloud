-- 2. Create admin_sessions table
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  device_hint   TEXT,
  ip_address    TEXT,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
