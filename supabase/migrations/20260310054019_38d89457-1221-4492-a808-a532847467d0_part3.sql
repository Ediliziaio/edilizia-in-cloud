CREATE INDEX idx_notifications_is_read    ON public.notifications(is_read) WHERE is_read = false;
