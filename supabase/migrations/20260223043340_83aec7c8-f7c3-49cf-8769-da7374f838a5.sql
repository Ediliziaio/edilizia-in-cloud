
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_end_time time WITHOUT TIME ZONE;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_blocked_slot boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS internal_notes text;
