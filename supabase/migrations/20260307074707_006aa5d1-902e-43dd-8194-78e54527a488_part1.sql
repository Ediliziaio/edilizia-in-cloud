-- 2) get_email_stats_by_campaign: per-campaign aggregation for top campaigns table
CREATE OR REPLACE FUNCTION public.get_email_stats_by_campaign(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  campaign_id uuid,
  campaign_name text,
  campaign_type text,
  sent_at timestamptz,
  delivered bigint,
  opened bigint,
  clicked bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ec.id AS campaign_id,
    ec.name AS campaign_name,
    ec.type AS campaign_type,
    ec.sent_at,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint AS delivered,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint AS opened,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint AS clicked
  FROM public.email_campaigns ec
  JOIN public.email_logs el ON el.campaign_id = ec.id
  WHERE ec.company_id = p_company_id
    AND ec.sent_at IS NOT NULL
    AND (p_campaign_id IS NULL OR ec.id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to)
  GROUP BY ec.id, ec.name, ec.type, ec.sent_at
  ORDER BY ec.sent_at DESC;
$$;
