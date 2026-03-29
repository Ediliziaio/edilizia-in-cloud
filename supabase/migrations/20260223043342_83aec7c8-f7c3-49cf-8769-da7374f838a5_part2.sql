ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS internal_notes text;
