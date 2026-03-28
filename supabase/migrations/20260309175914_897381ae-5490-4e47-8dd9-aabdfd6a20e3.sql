-- =============================================
-- UTM Attribution Tracking — Step 1
-- =============================================

-- 1. attribution_sessions: tracks visitor sessions with UTM data
CREATE TABLE public.attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  visitor_id text,
  landing_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  fbclid text,
  device_type text,
  browser text,
  os text,
  ip_hash text,
  country text,
  city text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  pages_viewed int DEFAULT 1,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
