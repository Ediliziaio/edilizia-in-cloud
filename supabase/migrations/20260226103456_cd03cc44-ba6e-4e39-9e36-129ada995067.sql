ALTER TABLE public.google_calendar_event_map 
ADD COLUMN IF NOT EXISTS last_updated_by text DEFAULT 'crm',
ADD COLUMN IF NOT EXISTS source text DEFAULT 'crm';