-- 1) get_email_stats_summary: global stats + funnel
CREATE OR REPLACE FUNCTION public.get_email_stats_summary(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  total bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint,
  unsubscribed bigint,
  spam bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint AS delivered,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint AS opened,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint AS clicked,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint AS bounced,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint AS unsubscribed,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint AS spam
  FROM public.email_logs el
  WHERE el.company_id = p_company_id
    AND (p_campaign_id IS NULL OR el.campaign_id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
$$;
