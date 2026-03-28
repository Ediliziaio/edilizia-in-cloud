-- ============================================================
-- 3. ESTENDI marketing_contacts
-- ============================================================
ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icp_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS icp_tier TEXT DEFAULT NULL;
