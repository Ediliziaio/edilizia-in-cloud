
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

-- 3) get_email_stats_by_date: daily aggregation by campaign type for performance chart
CREATE OR REPLACE FUNCTION public.get_email_stats_by_date(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date_label text,
  campaign_type text,
  total bigint,
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
    to_char(el.event_timestamp::date, 'DD/MM') AS date_label,
    COALESCE(ec.type, 'broadcast') AS campaign_type,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint AS delivered,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint AS opened,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint AS clicked
  FROM public.email_logs el
  LEFT JOIN public.email_campaigns ec ON ec.id = el.campaign_id
  WHERE el.company_id = p_company_id
    AND (p_campaign_id IS NULL OR el.campaign_id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to)
  GROUP BY el.event_timestamp::date, COALESCE(ec.type, 'broadcast')
  ORDER BY el.event_timestamp::date;
$$;
