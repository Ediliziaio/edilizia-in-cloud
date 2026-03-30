-- 3) get_email_stats_by_date: daily aggregation by campaign type for performance chart
DROP FUNCTION IF EXISTS public.get_email_stats_by_date(uuid, uuid, timestamptz, timestamptz) CASCADE;
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
