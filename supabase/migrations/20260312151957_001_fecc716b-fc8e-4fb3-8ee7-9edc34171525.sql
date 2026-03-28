-- Create a restricted view exposing ONLY slot-availability fields
CREATE OR REPLACE VIEW public.public_appointment_slots
WITH (security_invoker = true)
AS
SELECT
  id,
  appointment_date,
  appointment_time,
  appointment_end_time,
  is_blocked_slot,
  calendar_id,
  company_id
FROM public.appointments
WHERE calendar_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.marketing_calendars mc
    WHERE mc.id = appointments.calendar_id
      AND mc.booking_slug IS NOT NULL
      AND mc.is_active = true
  );
