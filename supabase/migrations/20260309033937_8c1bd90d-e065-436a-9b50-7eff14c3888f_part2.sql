ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS ab_test_duration_hours integer DEFAULT 4;
