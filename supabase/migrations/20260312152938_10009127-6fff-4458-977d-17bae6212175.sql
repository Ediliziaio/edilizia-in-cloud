
-- Create security definer function to safely get auth email
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Drop the broken policy
DROP POLICY IF EXISTS "customer_view_own_appointments" ON public.appointments;

-- Recreate using the security definer function
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
