-- Push notification tokens for native mobile apps (Capacitor / FCM / APNs)
-- Used by src/lib/mobile/native-push.ts to store device tokens after registration.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, token)
);

-- Index for looking up tokens by user (send notification to all user devices)
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

-- Index for looking up tokens by company (broadcast to company)
CREATE INDEX IF NOT EXISTS idx_push_tokens_company_id ON public.push_tokens(company_id);

-- RLS: users can only manage their own tokens
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can read all tokens (for edge functions sending push notifications)
CREATE POLICY "Service role can read all tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.role() = 'service_role');

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_tokens_updated_at_trigger
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.push_tokens_updated_at();
