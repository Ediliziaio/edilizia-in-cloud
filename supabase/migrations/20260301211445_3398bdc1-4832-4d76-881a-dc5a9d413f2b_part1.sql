CREATE INDEX IF NOT EXISTS idx_lifecycle_notif_company ON public.lifecycle_notifications(company_id, is_dismissed, created_at DESC);
