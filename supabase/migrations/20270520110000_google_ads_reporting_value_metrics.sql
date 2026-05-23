-- Google Ads reporting: valore conversioni e quota impressioni.
-- Colonne opzionali usate dai report marketing per CPA, ROAS e share di ricerca.

ALTER TABLE google_ads_stats
  ADD COLUMN IF NOT EXISTS conversion_value numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_impression_share numeric(8, 6);
