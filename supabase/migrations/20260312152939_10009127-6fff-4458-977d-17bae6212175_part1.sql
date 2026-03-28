-- Drop the broken policy
DROP POLICY IF EXISTS "customer_view_own_appointments" ON public.appointments;
