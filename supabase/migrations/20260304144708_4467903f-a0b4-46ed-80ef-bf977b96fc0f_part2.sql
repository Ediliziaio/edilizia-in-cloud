CREATE INDEX IF NOT EXISTS idx_automation_trigger_events_pending ON public.automation_trigger_events (created_at) WHERE processed = false;
