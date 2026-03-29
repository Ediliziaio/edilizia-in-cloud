CREATE INDEX IF NOT EXISTS idx_iaq_pending ON public.internal_automation_queue(status, execute_at) WHERE status = 'pending';
