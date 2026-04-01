-- M13: Google Ads Stats table
-- Memorizza le statistiche giornaliere per account Google Ads connessi all'azienda.
-- Popolata dall'edge function google-ads-sync (o manualmente via import).

CREATE TABLE IF NOT EXISTS google_ads_stats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date          date NOT NULL,
  campaign_id   text,
  campaign_name text,
  impressions   bigint NOT NULL DEFAULT 0,
  clicks        bigint NOT NULL DEFAULT 0,
  spend         numeric(12, 2) NOT NULL DEFAULT 0,
  conversions   numeric(10, 2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_stats_company_date
  ON google_ads_stats (company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_google_ads_stats_campaign
  ON google_ads_stats (company_id, campaign_name);

-- RLS
ALTER TABLE google_ads_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select_google_ads_stats"
  ON google_ads_stats FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_members_insert_google_ads_stats"
  ON google_ads_stats FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "company_members_update_google_ads_stats"
  ON google_ads_stats FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM multi_company_access WHERE user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_google_ads_stats_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_google_ads_stats_updated_at
  BEFORE UPDATE ON google_ads_stats
  FOR EACH ROW EXECUTE FUNCTION update_google_ads_stats_updated_at();
