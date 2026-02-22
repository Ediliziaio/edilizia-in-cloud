
-- Add calendar_id, status, contact_id to appointments table
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.marketing_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confermato',
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;

-- Index for calendar_id lookups
CREATE INDEX IF NOT EXISTS idx_appointments_calendar_id ON public.appointments(calendar_id);
CREATE INDEX IF NOT EXISTS idx_appointments_contact_id ON public.appointments(contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
