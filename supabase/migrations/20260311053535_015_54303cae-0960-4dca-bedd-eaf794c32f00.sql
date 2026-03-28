-- ============================================================
-- 5. INDEXES per performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_opp_expected_close
  ON marketing_opportunities(company_id, expected_close_date)
  WHERE status = 'open';
