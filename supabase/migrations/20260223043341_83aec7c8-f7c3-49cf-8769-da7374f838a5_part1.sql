ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_blocked_slot boolean NOT NULL DEFAULT false;
