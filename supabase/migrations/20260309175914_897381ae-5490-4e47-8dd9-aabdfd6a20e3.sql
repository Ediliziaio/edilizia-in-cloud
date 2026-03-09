
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

CREATE INDEX idx_attribution_sessions_company ON public.attribution_sessions(company_id);
CREATE INDEX idx_attribution_sessions_session ON public.attribution_sessions(session_id);
CREATE INDEX idx_attribution_sessions_visitor ON public.attribution_sessions(visitor_id);
CREATE INDEX idx_attribution_sessions_contact ON public.attribution_sessions(contact_id);
CREATE INDEX idx_attribution_sessions_started ON public.attribution_sessions(started_at);
CREATE INDEX idx_attribution_sessions_source ON public.attribution_sessions(utm_source);

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attribution_sessions_tenant_select" ON public.attribution_sessions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "attribution_sessions_tenant_insert" ON public.attribution_sessions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- Allow service_role insert (for edge function)
CREATE POLICY "attribution_sessions_service_insert" ON public.attribution_sessions
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "attribution_sessions_service_select" ON public.attribution_sessions
  FOR SELECT TO service_role
  USING (true);

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

CREATE INDEX idx_contact_attributions_company ON public.contact_attributions(company_id);
CREATE INDEX idx_contact_attributions_contact ON public.contact_attributions(contact_id);

ALTER TABLE public.contact_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_attributions_tenant_select" ON public.contact_attributions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "contact_attributions_tenant_all" ON public.contact_attributions
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "contact_attributions_service_all" ON public.contact_attributions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. ALTER marketing_contacts: add attribution columns
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS attr_source text,
  ADD COLUMN IF NOT EXISTS attr_medium text,
  ADD COLUMN IF NOT EXISTS attr_campaign text,
  ADD COLUMN IF NOT EXISTS attr_content text,
  ADD COLUMN IF NOT EXISTS attr_model text DEFAULT 'last_touch';

-- 4. RPC: get_attribution_report
CREATE OR REPLACE FUNCTION public.get_attribution_report(
  p_company_id uuid,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_group_by text DEFAULT 'source'
)
RETURNS TABLE(
  dimension text,
  sessions bigint,
  unique_visitors bigint,
  contacts_created bigint,
  conversions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_group_by = 'medium' THEN
    RETURN QUERY
      SELECT
        COALESCE(s.utm_medium, 'direct') AS dimension,
        COUNT(s.id) AS sessions,
        COUNT(DISTINCT s.visitor_id) AS unique_visitors,
        COUNT(DISTINCT s.contact_id) AS contacts_created,
        COUNT(DISTINCT CASE WHEN ca.contact_id IS NOT NULL THEN ca.contact_id END) AS conversions
      FROM attribution_sessions s
      LEFT JOIN contact_attributions ca ON ca.last_touch_session_id = s.id
      WHERE s.company_id = p_company_id
        AND s.started_at >= p_date_from
        AND s.started_at <= p_date_to
      GROUP BY s.utm_medium
      ORDER BY sessions DESC;
  ELSIF p_group_by = 'campaign' THEN
    RETURN QUERY
      SELECT
        COALESCE(s.utm_campaign, '(nessuna)') AS dimension,
        COUNT(s.id) AS sessions,
        COUNT(DISTINCT s.visitor_id) AS unique_visitors,
        COUNT(DISTINCT s.contact_id) AS contacts_created,
        COUNT(DISTINCT CASE WHEN ca.contact_id IS NOT NULL THEN ca.contact_id END) AS conversions
      FROM attribution_sessions s
      LEFT JOIN contact_attributions ca ON ca.last_touch_session_id = s.id
      WHERE s.company_id = p_company_id
        AND s.started_at >= p_date_from
        AND s.started_at <= p_date_to
      GROUP BY s.utm_campaign
      ORDER BY sessions DESC;
  ELSIF p_group_by = 'content' THEN
    RETURN QUERY
      SELECT
        COALESCE(s.utm_content, '(nessuno)') AS dimension,
        COUNT(s.id) AS sessions,
        COUNT(DISTINCT s.visitor_id) AS unique_visitors,
        COUNT(DISTINCT s.contact_id) AS contacts_created,
        COUNT(DISTINCT CASE WHEN ca.contact_id IS NOT NULL THEN ca.contact_id END) AS conversions
      FROM attribution_sessions s
      LEFT JOIN contact_attributions ca ON ca.last_touch_session_id = s.id
      WHERE s.company_id = p_company_id
        AND s.started_at >= p_date_from
        AND s.started_at <= p_date_to
      GROUP BY s.utm_content
      ORDER BY sessions DESC;
  ELSE
    -- default: source
    RETURN QUERY
      SELECT
        COALESCE(s.utm_source, 'direct') AS dimension,
        COUNT(s.id) AS sessions,
        COUNT(DISTINCT s.visitor_id) AS unique_visitors,
        COUNT(DISTINCT s.contact_id) AS contacts_created,
        COUNT(DISTINCT CASE WHEN ca.contact_id IS NOT NULL THEN ca.contact_id END) AS conversions
      FROM attribution_sessions s
      LEFT JOIN contact_attributions ca ON ca.last_touch_session_id = s.id
      WHERE s.company_id = p_company_id
        AND s.started_at >= p_date_from
        AND s.started_at <= p_date_to
      GROUP BY s.utm_source
      ORDER BY sessions DESC;
  END IF;
END;
$$;

-- 5. Function: attach_attribution_to_contact
CREATE OR REPLACE FUNCTION public.attach_attribution_to_contact(
  p_session_id uuid,
  p_contact_id uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session attribution_sessions%ROWTYPE;
BEGIN
  -- Get session data
  SELECT * INTO v_session FROM attribution_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Link session to contact
  UPDATE attribution_sessions SET contact_id = p_contact_id WHERE id = p_session_id;

  -- Upsert contact_attributions
  INSERT INTO contact_attributions (
    company_id, contact_id,
    first_touch_session_id, last_touch_session_id,
    first_touch_at, last_touch_at,
    first_source, first_medium, first_campaign,
    last_source, last_medium, last_campaign,
    total_sessions
  ) VALUES (
    p_company_id, p_contact_id,
    p_session_id, p_session_id,
    v_session.started_at, v_session.started_at,
    v_session.utm_source, v_session.utm_medium, v_session.utm_campaign,
    v_session.utm_source, v_session.utm_medium, v_session.utm_campaign,
    1
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    last_touch_session_id = p_session_id,
    last_touch_at = v_session.started_at,
    last_source = v_session.utm_source,
    last_medium = v_session.utm_medium,
    last_campaign = v_session.utm_campaign,
    total_sessions = contact_attributions.total_sessions + 1,
    updated_at = now();

  -- Update marketing_contacts attribution columns (last touch)
  UPDATE marketing_contacts SET
    attr_source = v_session.utm_source,
    attr_medium = v_session.utm_medium,
    attr_campaign = v_session.utm_campaign,
    attr_content = v_session.utm_content
  WHERE id = p_contact_id;
END;
$$;
