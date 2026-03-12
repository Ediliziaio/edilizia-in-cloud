
-- 1. Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

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

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_own_sessions_select"
  ON public.admin_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "admin_own_sessions_delete"
  ON public.admin_sessions FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
  ON public.admin_sessions(user_id, last_seen_at DESC);

-- 3. Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policy: anyone can read avatars (public bucket)
CREATE POLICY "Public avatar read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 5. Storage policy: authenticated users can upload their own avatar
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );

-- 6. Storage policy: users can update their own avatar
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );

-- 7. Storage policy: users can delete their own avatar
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'admin'
    AND auth.uid() IS NOT NULL
  );
