-- ============================================================
-- SECURITY FIX: staff_permissions - privilege escalation
-- Remove broad UPDATE, keep only SELECT for staff + RPC for password flag
-- ============================================================
DROP POLICY IF EXISTS "Staff can update their own password flag" ON public.staff_permissions;
