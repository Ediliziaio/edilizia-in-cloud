-- ============================================================
-- 1. APPOINTMENTS: Replace anon policy with a secure VIEW
-- ============================================================

-- Drop the existing overly-permissive anon policy
DROP POLICY IF EXISTS "Public can check appointment slots" ON public.appointments;
