-- Step 4: Update get_attribution_report RPC
DROP FUNCTION IF EXISTS public.get_attribution_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.get_attribution_report(
  p_company_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ,
  p_group_by TEXT DEFAULT 'source',
  p_filter_source TEXT DEFAULT NULL
) RETURNS TABLE(
  dimension TEXT,
  sessions BIGINT,
  unique_visitors BIGINT,
  contacts_created BIGINT,
  conversions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      CASE p_group_by
        WHEN 'source' THEN s.utm_source
        WHEN 'medium' THEN s.utm_medium
        WHEN 'campaign' THEN s.utm_campaign
        WHEN 'content' THEN s.utm_content
      END, '(diretto)'
    ) AS dimension,
    COUNT(*)::BIGINT AS sessions,
    COUNT(DISTINCT s.visitor_id)::BIGINT AS unique_visitors,
    COUNT(DISTINCT s.contact_id)::BIGINT AS contacts_created,
    COUNT(DISTINCT CASE WHEN s.converted_at IS NOT NULL OR s.contact_id IS NOT NULL THEN s.id END)::BIGINT AS conversions
  FROM public.attribution_sessions s
  WHERE s.company_id = p_company_id
    AND s.started_at >= p_date_from
    AND s.started_at <= p_date_to
    AND (p_filter_source IS NULL OR s.utm_source = p_filter_source)
  GROUP BY 1
  ORDER BY sessions DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
