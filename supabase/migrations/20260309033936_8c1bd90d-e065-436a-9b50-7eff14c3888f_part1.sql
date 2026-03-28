ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_winner_criteria text DEFAULT 'open_rate';
