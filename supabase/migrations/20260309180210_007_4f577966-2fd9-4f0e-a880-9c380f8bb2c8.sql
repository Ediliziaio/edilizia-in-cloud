-- 2. form_views: tracking views
CREATE TABLE public.form_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visitor_id text,
  session_id text,
  ip_hash text,
  referrer text,
  user_agent text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
