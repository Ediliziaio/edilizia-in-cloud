CREATE INDEX IF NOT EXISTS idx_email_delivery_log_sent_at
  ON public.email_delivery_log (sent_at DESC);
