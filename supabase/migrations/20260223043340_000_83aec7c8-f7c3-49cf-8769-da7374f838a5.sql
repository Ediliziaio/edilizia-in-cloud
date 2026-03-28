ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_end_time time WITHOUT TIME ZONE;
