-- A/B variant tracking in email_logs
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS ab_variant text;
