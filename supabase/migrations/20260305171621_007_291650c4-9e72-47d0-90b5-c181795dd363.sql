CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_status ON public.integration_webhook_events (status, company_id);
