
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS reminder_minutes integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
