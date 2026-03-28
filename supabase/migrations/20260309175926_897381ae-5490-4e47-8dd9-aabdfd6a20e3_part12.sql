-- 2. contact_attributions: first/last touch per contact
CREATE TABLE public.contact_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  first_touch_session_id uuid REFERENCES public.attribution_sessions(id) ON DELETE SET NULL,
  last_touch_session_id uuid REFERENCES public.attribution_sessions(id) ON DELETE SET NULL,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  first_source text,
  first_medium text,
  first_campaign text,
  last_source text,
  last_medium text,
  last_campaign text,
  total_sessions int DEFAULT 1,
  attribution_model text DEFAULT 'last_touch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id)
);
