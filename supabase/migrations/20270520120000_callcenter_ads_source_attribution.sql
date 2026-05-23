-- Call center reporting: rendi le fonti lead leggibili per Meta/Google Ads.
-- La vista mantiene le stesse colonne, ma usa attribution/campaign quando presenti.

CREATE OR REPLACE VIEW public.callcenter_lead_journey
WITH (security_invoker = true)
AS
SELECT
  mc.id AS contact_id,
  mc.company_id,
  mc.assigned_to AS operatore_assegnato,
  mc.created_at AS lead_created_at,
  CASE
    WHEN mc.google_campaign_id IS NOT NULL
      OR mc.gclid IS NOT NULL
      OR mc.wbraid IS NOT NULL
      OR mc.gbraid IS NOT NULL
      OR lower(COALESCE(mc.attr_source, '')) IN ('google', 'google_ads', 'adwords')
      OR lower(COALESCE(mc.attr_medium, '')) IN ('cpc', 'ppc', 'paid_search')
      OR lower(COALESCE(mc.source, '')) LIKE '%google%'
      THEN 'Google Ads · ' || COALESCE(NULLIF(mc.attr_campaign, ''), NULLIF(mc.google_campaign_id, ''), NULLIF(mc.source_campaign_id, ''), NULLIF(mc.source, ''), 'senza campagna')
    WHEN mc.meta_campaign_id IS NOT NULL
      OR mc.meta_adset_id IS NOT NULL
      OR mc.meta_ad_id IS NOT NULL
      OR lower(COALESCE(mc.attr_source, '')) IN ('meta', 'facebook', 'instagram')
      OR lower(COALESCE(mc.attr_medium, '')) = 'paid_social'
      OR lower(COALESCE(mc.source, '')) LIKE '%facebook%'
      OR lower(COALESCE(mc.source, '')) LIKE '%instagram%'
      OR lower(COALESCE(mc.source, '')) LIKE '%meta%'
      THEN 'Meta Ads · ' || COALESCE(NULLIF(mc.attr_campaign, ''), NULLIF(mc.meta_campaign_id, ''), NULLIF(mc.source_campaign_id, ''), NULLIF(mc.source, ''), 'senza campagna')
    ELSE COALESCE(NULLIF(mc.source, ''), NULLIF(mc.attr_source, ''), 'Non specificata')
  END::text AS fonte_lead,
  MIN(cl.started_at) AS prima_chiamata_at,
  EXTRACT(EPOCH FROM (
    MIN(cl.started_at::timestamptz) - mc.created_at::timestamptz
  )) / 60.0 AS speed_to_lead_minuti,
  COUNT(cl.id) AS nr_tentativi,
  COUNT(cl.id) FILTER (WHERE cl.outcome = 'answered') AS nr_contatti_riusciti,
  BOOL_OR(cl.outcome = 'answered') AS fu_contattato,
  COUNT(cl.id) > 0 AS fu_lavorato,
  AVG(cl.duration_sec / 60.0) FILTER (WHERE cl.outcome = 'answered') AS durata_media_chiamata,
  COUNT(DISTINCT apt.id) AS appuntamenti_fissati,
  COUNT(DISTINCT apt.id) FILTER (
    WHERE apt.status IN ('confermato', 'completed', 'done', 'showed')
  ) AS appuntamenti_show_up
FROM public.marketing_contacts mc
LEFT JOIN public.call_logs cl ON cl.contact_id = mc.id
LEFT JOIN public.appointments apt ON apt.contact_id = mc.id
GROUP BY
  mc.id,
  mc.company_id,
  mc.assigned_to,
  mc.created_at,
  mc.source,
  mc.source_campaign_id,
  mc.attr_source,
  mc.attr_medium,
  mc.attr_campaign,
  mc.meta_campaign_id,
  mc.meta_adset_id,
  mc.meta_ad_id,
  mc.google_campaign_id,
  mc.gclid,
  mc.wbraid,
  mc.gbraid;
