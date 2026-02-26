CREATE UNIQUE INDEX IF NOT EXISTS uq_gcal_busy_slots_event 
ON public.google_calendar_busy_slots (company_id, user_id, google_event_id);