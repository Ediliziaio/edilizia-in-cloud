CREATE INDEX IF NOT EXISTS idx_opp_stalled
  ON marketing_opportunities(company_id, stalled_notified_at)
  WHERE status = 'open';
