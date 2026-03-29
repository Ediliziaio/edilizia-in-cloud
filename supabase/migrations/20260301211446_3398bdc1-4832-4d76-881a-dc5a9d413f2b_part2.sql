CREATE UNIQUE INDEX idx_lifecycle_notif_unique ON public.lifecycle_notifications(company_id, notification_type, notification_date);
