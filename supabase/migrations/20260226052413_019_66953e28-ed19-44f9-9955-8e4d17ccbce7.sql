CREATE INDEX idx_gcbs_company_user_time ON public.google_calendar_busy_slots(company_id, user_id, start_at, end_at);
