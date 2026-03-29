-- ─── 5. Also fix order_status_history if it has the same pattern ─────────────
DROP POLICY IF EXISTS "Company admins can manage their order history"       ON public.order_status_history;
