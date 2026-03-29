CREATE INDEX IF NOT EXISTS idx_opp_next_action_date
  ON marketing_opportunities(company_id, next_action_date)
  WHERE status = 'open' AND next_action_date IS NOT NULL;
