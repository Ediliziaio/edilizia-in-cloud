-- Index for calendar_id lookups
CREATE INDEX IF NOT EXISTS idx_appointments_calendar_id ON public.appointments(calendar_id);
