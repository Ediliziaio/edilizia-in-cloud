CREATE INDEX IF NOT EXISTS idx_leave_requests_dates      ON public.leave_requests(start_date, end_date);
