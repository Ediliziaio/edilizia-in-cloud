-- Drop the anon SELECT policy that exposes sensitive appointment data
-- The public_appointment_slots view already provides safe read access for booking
DROP POLICY IF EXISTS "Public can check appointment slots" ON public.appointments;