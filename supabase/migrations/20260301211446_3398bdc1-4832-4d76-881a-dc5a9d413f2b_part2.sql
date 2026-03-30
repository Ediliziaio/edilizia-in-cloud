CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_notif_unique ON public.lifecycle_notifications(company_id, notification_type, notification_date);
