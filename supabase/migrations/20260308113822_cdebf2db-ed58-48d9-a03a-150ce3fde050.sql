-- get_email_stats_summary already created successfully in prior migration
-- Only creating the remaining RPCs

-- RPC: get_email_stats_by_campaign
CREATE OR REPLACE FUNCTION public.get_email_stats_by_campaign(
  p_company_id uuid,
  p_campaign_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  campaign_id uuid, campaign_name text, campaign_type text,
  sent_at timestamptz, delivered bigint, opened bigint, clicked bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    ec.id, ec.name, ec.type, ec.sent_at,
    COUNT(*) FILTER (WHERE el.status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE el.opened_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE el.clicked_at IS NOT NULL)::bigint
  FROM public.email_campaigns ec
  LEFT JOIN public.email_logs el ON el.campaign_id = ec.id
  WHERE ec.company_id = p_company_id
    AND (p_campaign_id IS NULL OR ec.id = p_campaign_id)
    AND (p_date_from IS NULL OR ec.sent_at >= p_date_from)
    AND (p_date_to IS NULL OR ec.sent_at <= p_date_to)
  GROUP BY ec.id, ec.name, ec.type, ec.sent_at
  ORDER BY ec.sent_at DESC NULLS LAST
  LIMIT 50;
$$;
