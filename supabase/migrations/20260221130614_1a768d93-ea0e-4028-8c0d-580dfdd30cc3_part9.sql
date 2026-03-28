-- Appointments: drop and recreate with visibility check
DROP POLICY IF EXISTS "Staff can manage appointments if permitted" ON public.appointments;
