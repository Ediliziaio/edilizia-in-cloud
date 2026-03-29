-- A/B Testing fields for email_campaigns
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_split_percent integer DEFAULT 50;
