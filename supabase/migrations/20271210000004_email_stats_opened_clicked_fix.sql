-- ════════════════════════════════════════════════════════════════════════════
-- FIX statistiche email marketing
-- ────────────────────────────────────────────────────────────────────────────
-- 1) get_email_stats_summary contava aperture/clic da email_logs.status
--    ('opened'/'clicked'), ma NESSUN code-path scrive mai quegli stati: i
--    webhook e il tracking pixel scrivono solo opened_at/clicked_at e lo
--    status resta 'delivered'. Risultato: "Tasso di apertura" e "Tasso di
--    clic" nella KPI Hero e nel funnel erano SEMPRE 0.0%, in contraddizione
--    con la tabella "migliori prestazioni" (che usa già i timestamp) nella
--    stessa pagina. Fix: contare su opened_at/clicked_at IS NOT NULL.
-- 2) get_email_stats_by_date bucketizzava i giorni in UTC: un'apertura alle
--    00:30 italiane finiva nel giorno precedente sull'asse X. Fix: bucket in
--    Europe/Rome (convenzione repo: date sempre locali).
-- ════════════════════════════════════════════════════════════════════════════

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
    COUNT(*) FILTER (WHERE el.opened_at IS NOT NULL)::bigint AS opened,
    COUNT(*) FILTER (WHERE el.clicked_at IS NOT NULL)::bigint AS clicked,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint AS bounced,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint AS unsubscribed,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint AS spam
  FROM public.email_logs el
  WHERE el.company_id = p_company_id
    AND (p_campaign_id IS NULL OR el.campaign_id = p_campaign_id)
    AND (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
$$;

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
    to_char(el.event_timestamp AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD'),
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
