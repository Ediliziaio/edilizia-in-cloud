-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE VIEW public.lead_scraper_source_analytics
WITH (security_invoker = true) AS
SELECT
  source,
  count(*)                                                        AS total,
  count(*) FILTER (WHERE email IS NOT NULL OR phone IS NOT NULL)  AS contactable,
  count(*) FILTER (WHERE email IS NOT NULL)                       AS with_email,
  count(*) FILTER (WHERE phone IS NOT NULL)                       AS with_phone,
  count(*) FILTER (WHERE email_status = 'pec')                    AS with_pec,
  count(*) FILTER (WHERE partita_iva IS NOT NULL)                 AS with_piva,
  count(*) FILTER (WHERE ai_score IS NOT NULL)                    AS qualified,
  count(*) FILTER (WHERE ai_label = 'hot')                        AS hot,
  count(*) FILTER (WHERE buying_score IS NOT NULL AND buying_score >= 60) AS high_intent,
  count(*) FILTER (WHERE pushed_to_crm)                           AS in_crm,
  count(*) FILTER (WHERE crm_opportunity_id IS NOT NULL)          AS opportunities,
  count(*) FILTER (WHERE is_existing_customer)                    AS existing_customers,
  round(avg(ai_score)     FILTER (WHERE ai_score IS NOT NULL), 1)     AS avg_ai_score,
  round(avg(buying_score) FILTER (WHERE buying_score IS NOT NULL), 1) AS avg_buying_score,
  max(created_at)                                                 AS last_lead_at
FROM public.lead_scraper_results
GROUP BY source;

COMMENT ON VIEW public.lead_scraper_source_analytics IS
  'ROI per fonte: totale → contattabili → qualificati → CRM → opportunità, con qualità media.';

CREATE OR REPLACE VIEW public.lead_scraper_provider_usage
WITH (security_invoker = true) AS
SELECT
  provider,
  sum(count)                                                   AS calls_total,
  sum(count) FILTER (WHERE day >= CURRENT_DATE - 30)           AS calls_30d,
  sum(count) FILTER (WHERE day = CURRENT_DATE)                 AS calls_today,
  max(day)                                                     AS last_used
FROM public.lead_scraper_api_usage
GROUP BY provider;

COMMENT ON VIEW public.lead_scraper_provider_usage IS
  'Chiamate per provider esterno: totale, ultimi 30 giorni, oggi.';

GRANT SELECT ON public.lead_scraper_source_analytics TO authenticated;
GRANT SELECT ON public.lead_scraper_provider_usage  TO authenticated;
