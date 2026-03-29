-- Add calendar_id, status, contact_id to appointments table
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.marketing_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confermato',
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;
