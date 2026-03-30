-- RPC: get_email_stats_by_date
DROP FUNCTION IF EXISTS public.get_email_stats_by_date(uuid, uuid, timestamptz, timestamptz) CASCADE;
CREATE OR REPLACE FUNCTION public.get_email_stats_by_date(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  date_label text, campaign_type text,
  total bigint, delivered bigint, opened bigint, clicked bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    to_char(el.event_timestamp, 'YYYY-MM-DD'),
    COALESCE(ec.type, 'broadcast'),
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE el.status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE el.opened_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE el.clicked_at IS NOT NULL)::bigint
  FROM public.email_logs el
  LEFT JOIN public.email_campaigns ec ON ec.id = el.campaign_id
  WHERE el.company_id = p_company_id
    AND (p_campaign_id IS NULL OR el.campaign_id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to)
  GROUP BY 1, 2 ORDER BY 1;
$$;
