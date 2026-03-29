-- GAP-18: Add missing performance indexes on email_logs
-- These indexes are critical for webhook matching, campaign stats queries,
-- and open/click rate calculations.

-- Index for webhook provider_message_id lookup (used by email-provider-webhook)
CREATE INDEX IF NOT EXISTS email_logs_provider_msg_idx
  ON public.email_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Index for campaign-level stats queries (join email_logs → email_campaigns)
CREATE INDEX IF NOT EXISTS email_logs_campaign_id_idx
  ON public.email_logs(campaign_id);

-- Index for company-level dashboard queries (filter by company + status)
CREATE INDEX IF NOT EXISTS email_logs_company_status_idx
  ON public.email_logs(company_id, status);

-- Partial index for open-rate calculations (only rows with open events)
CREATE INDEX IF NOT EXISTS email_logs_opened_at_idx
  ON public.email_logs(opened_at)
  WHERE opened_at IS NOT NULL;
