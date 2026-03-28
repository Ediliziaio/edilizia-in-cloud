-- Index for efficient polling
CREATE INDEX idx_automation_queue_pending ON public.automation_queue (execute_at) WHERE status = 'pending';
