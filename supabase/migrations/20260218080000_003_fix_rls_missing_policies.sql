-- ─────────────────────────────────────────────────────────────
-- 2. order_external_teams
-- ─────────────────────────────────────────────────────────────

-- Company staff con permesso can_view_orders può vedere i costi squadre
-- esterne degli ordini della propria azienda
CREATE POLICY "Staff can view order external teams if permitted"
  ON public.order_external_teams FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_external_teams.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
