-- Migration: nps_surveys
-- Tracks NPS survey sends and responses.

CREATE TABLE IF NOT EXISTS public.nps_surveys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score           integer CHECK (score BETWEEN 0 AND 10),
  feedback_text   text,
  trigger_event   text,         -- 'first_month', 'quarterly', 'high_usage', etc.
  token           text UNIQUE,  -- signed token for public response link
  sent_at         timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_nps_surveys_company
  ON public.nps_surveys(company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_nps_surveys_token
  ON public.nps_surveys(token)
  WHERE token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nps_surveys_responded
  ON public.nps_surveys(responded_at DESC)
  WHERE responded_at IS NOT NULL;

-- RLS
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage nps surveys" ON public.nps_surveys;
CREATE POLICY "Super admins manage nps surveys"
  ON public.nps_surveys FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Service role manage nps surveys" ON public.nps_surveys;
CREATE POLICY "Service role manage nps surveys"
  ON public.nps_surveys FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can update (respond) their survey via token (handled in edge function with service role)
