-- ============================================================
-- SECURITY FIX: quotes - anon PII exposure (UUID cast)
-- ============================================================
DROP POLICY IF EXISTS "q_anon_sel" ON public.quotes;
