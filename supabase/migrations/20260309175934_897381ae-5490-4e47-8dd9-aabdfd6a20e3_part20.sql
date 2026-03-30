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
