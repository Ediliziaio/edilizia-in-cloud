-- =============================================================
-- FIX: Policy RLS mancanti per ruoli company_staff ed employee
--
-- Tabelle interessate:
--   1. order_items        — staff view/edit, employee view
--   2. order_external_teams — staff view
--   3. warehouse_stock    — staff insert/update/delete
--   4. warehouse_movements — staff insert (CRITICO)
--
-- Logica permessi:
--   has_permission() ritorna true anche per super_admin e company_admin
--   → le policy staff non entrano in conflitto con quelle admin esistenti
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. order_items
-- ─────────────────────────────────────────────────────────────

-- Company staff con permesso can_view_orders può vedere gli articoli
-- degli ordini della propria azienda
CREATE POLICY "Staff can view order items if permitted"
  ON public.order_items FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );
