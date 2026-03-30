-- Re-add a minimal anon policy on the base table scoped to view usage
-- (security_invoker on the view means RLS still applies on the base table)
DROP POLICY IF EXISTS "Public can check appointment slots" ON public.appointments;
CREATE POLICY "Public can check appointment slots"
ON public.appointments
FOR SELECT
TO anon
USING (
  calendar_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.marketing_calendars mc
    WHERE mc.id = appointments.calendar_id
      AND mc.booking_slug IS NOT NULL
      AND mc.is_active = true
  )
);
