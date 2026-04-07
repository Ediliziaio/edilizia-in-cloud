-- IMP-3: CRM Campagne Outbound — tabella per campagne email/marketing ai contatti
-- Admin-only, RLS protetta, supporta draft/scheduled/sending/sent/failed

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text         NOT NULL,
  subject         text         NOT NULL,
  html_body       text         NOT NULL DEFAULT '',
  contact_filter  jsonb        NOT NULL DEFAULT '{}',
  -- contact_filter supporta: { contact_type, tags, source, score_min, score_max }
  status          text         NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  total_contacts  int          NOT NULL DEFAULT 0,
  sent_count      int          NOT NULL DEFAULT 0,
  error_count     int          NOT NULL DEFAULT 0,
  error_message   text,
  created_by      uuid         REFERENCES auth.users(id),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_crm_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_crm_campaigns_updated_at ON public.crm_campaigns;
CREATE TRIGGER set_crm_campaigns_updated_at
  BEFORE UPDATE ON public.crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_campaigns_updated_at();

-- RLS: solo super_admin
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_crm_campaigns"
  ON public.crm_campaigns FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Indici
CREATE INDEX IF NOT EXISTS crm_campaigns_status_idx ON public.crm_campaigns (status);
CREATE INDEX IF NOT EXISTS crm_campaigns_created_at_idx ON public.crm_campaigns (created_at DESC);
