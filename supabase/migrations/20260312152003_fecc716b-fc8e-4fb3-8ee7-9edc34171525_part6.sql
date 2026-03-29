-- ============================================================
-- 3. BILLING INTEGRATIONS: Restrict to admin roles only
-- ============================================================

DROP POLICY IF EXISTS "company_billing_integrations" ON public.billing_integrations;
