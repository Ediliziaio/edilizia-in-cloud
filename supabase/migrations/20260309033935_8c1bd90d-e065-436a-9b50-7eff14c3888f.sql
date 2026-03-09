
-- A/B Testing fields for email_campaigns
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_split_percent integer DEFAULT 50;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_winner_criteria text DEFAULT 'open_rate';
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_test_duration_hours integer DEFAULT 4;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_winner text;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_html_content_b text;

-- A/B variant tracking in email_logs
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS ab_variant text;
