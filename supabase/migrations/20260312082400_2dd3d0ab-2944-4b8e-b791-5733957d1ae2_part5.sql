CREATE INDEX IF NOT EXISTS idx_email_delivery_log_status
  ON public.email_delivery_log (status, sent_at DESC);
