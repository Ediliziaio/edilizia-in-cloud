-- Allinea meta_insights_cache alle colonne "flat" che meta-ads-sync-insights
-- (writer) e useMetaInsights (reader) già usano da sempre, ma che non erano
-- mai state migrate → ogni upsert/select falliva silenziosamente (campaigns=0,
-- insights sempre 0 in dashboard). Aggiunta puramente ADDITIVA: la colonna
-- legacy payload_json (usata da meta-api-proxy) resta intatta e coesiste.
ALTER TABLE public.meta_insights_cache
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS adset_id uuid,
  ADD COLUMN IF NOT EXISTS ad_id uuid,
  ADD COLUMN IF NOT EXISTS date_stop date,
  ADD COLUMN IF NOT EXISTS spend_cents bigint,
  ADD COLUMN IF NOT EXISTS impressions bigint,
  ADD COLUMN IF NOT EXISTS clicks integer,
  ADD COLUMN IF NOT EXISTS cpm_cents integer,
  ADD COLUMN IF NOT EXISTS cpc_cents integer,
  ADD COLUMN IF NOT EXISTS ctr double precision,
  ADD COLUMN IF NOT EXISTS reach bigint,
  ADD COLUMN IF NOT EXISTS frequency double precision,
  ADD COLUMN IF NOT EXISTS leads integer,
  ADD COLUMN IF NOT EXISTS cost_per_lead_cents integer,
  ADD COLUMN IF NOT EXISTS raw jsonb;

-- Unique per l'upsert onConflict del sync (company_id, campaign_id, date_start, date_stop).
-- campaign_id NULL sulle righe legacy → trattate come distinte (no conflitto).
CREATE UNIQUE INDEX IF NOT EXISTS meta_insights_cache_flat_uniq
  ON public.meta_insights_cache (company_id, campaign_id, date_start, date_stop);

-- Indice di lettura per useMetaInsights (filtra per company + date_start).
CREATE INDEX IF NOT EXISTS meta_insights_cache_company_date_idx
  ON public.meta_insights_cache (company_id, date_start);
