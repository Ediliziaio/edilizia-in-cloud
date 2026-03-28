-- ============================================================
-- SECURITY FIX: signature_requests - public_read_by_token
-- ============================================================
DROP POLICY IF EXISTS "public_read_by_token" ON public.signature_requests;
