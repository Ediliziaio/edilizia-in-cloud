-- ─── 4. Fix order_items policies ─────────────────────────────────────────────
-- These also have direct orders subqueries that could cause issues

DROP POLICY IF EXISTS "Company admins can manage their order items"         ON public.order_items;
