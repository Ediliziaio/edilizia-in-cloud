-- GAP-13: Global cross-company email suppression list
-- Emails in this table are never sent to, regardless of company or campaign.
-- Used for hard bounces, legal opt-outs, and platform-level blocks.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'manual', -- manual | bounce | spam | legal
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suppressed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         TEXT,
  CONSTRAINT email_suppressions_email_unique UNIQUE (email)
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Only super_admins can read/write the suppression list
CREATE POLICY "Super admins manage email_suppressions"
  ON public.email_suppressions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS email_suppressions_email_idx
  ON public.email_suppressions(email);
