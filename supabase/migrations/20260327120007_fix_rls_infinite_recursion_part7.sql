-- ─── 3. Fix order_salespeople policies ───────────────────────────────────────

DROP POLICY IF EXISTS "Company admins can manage their order salespeople"   ON public.order_salespeople;
