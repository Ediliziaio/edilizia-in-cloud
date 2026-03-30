-- 6. RPC: get_platform_email_stats
DROP FUNCTION IF EXISTS public.get_platform_email_stats(timestamptz, timestamptz) CASCADE;
CREATE OR REPLACE FUNCTION public.get_platform_email_stats(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  total_sent bigint,
  total_delivered bigint,
  total_opened bigint,
  total_clicked bigint,
  total_bounced bigint,
  total_unsubscribed bigint,
  total_spam bigint,
  total_credits_used numeric,
  total_revenue numeric,
  active_companies bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint,
    COALESCE((SELECT SUM(ec2.credits_used) FROM public.email_campaigns ec2
      WHERE (p_date_from IS NULL OR ec2.sent_at >= p_date_from)
      AND (p_date_to IS NULL OR ec2.sent_at <= p_date_to)), 0)::numeric,
    COALESCE((SELECT SUM(ecr.total_spent_eur) FROM public.email_credits ecr), 0)::numeric,
    COUNT(DISTINCT el.company_id)::bigint
  FROM public.email_logs el
  WHERE (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
$$;
