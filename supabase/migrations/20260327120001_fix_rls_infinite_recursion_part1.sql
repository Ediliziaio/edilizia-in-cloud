-- ─── 2. Fix order_employees policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Company admins can manage their order employees"    ON public.order_employees;
