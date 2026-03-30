-- Recreate using the security definer function
DROP POLICY IF EXISTS "customer_view_own_appointments" ON public.appointments;
CREATE POLICY "customer_view_own_appointments"
ON public.appointments
FOR SELECT TO authenticated
USING (
  contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM marketing_contacts mc
    WHERE mc.id = appointments.contact_id
    AND mc.email = public.get_auth_email()
  )
);
