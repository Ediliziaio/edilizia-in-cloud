
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

-- RPC: get_email_stats_by_date
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

-- RPC: get_top_companies_by_email
CREATE OR REPLACE FUNCTION public.get_top_companies_by_email(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  company_id uuid, company_name text, total_spent numeric,
  balance numeric, total_sent bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    ec.company_id, c.name,
    COALESCE(ec.total_spent_eur, 0),
    COALESCE(ec.balance_eur, 0),
    COALESCE(logs.cnt, 0)::bigint
  FROM public.email_credits ec
  JOIN public.companies c ON c.id = ec.company_id
  LEFT JOIN (
    SELECT company_id, COUNT(*)::bigint AS cnt FROM public.email_logs GROUP BY company_id
  ) logs ON logs.company_id = ec.company_id
  ORDER BY ec.total_spent_eur DESC NULLS LAST
  LIMIT p_limit;
$$;
