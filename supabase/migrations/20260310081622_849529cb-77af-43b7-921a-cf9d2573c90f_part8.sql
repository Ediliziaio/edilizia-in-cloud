-- ============================================================
-- SECURITY FIX: login_attempts - restrict INSERT
-- ============================================================
DROP POLICY IF EXISTS "login_attempts_insert_service" ON public.login_attempts;
