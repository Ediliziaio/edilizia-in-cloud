-- ─────────────────────────────────────────────────────────────
-- SEZIONE MAGAZZINO  (can_view_warehouse / can_edit_warehouse)
-- ─────────────────────────────────────────────────────────────
-- [warehouse_stock e warehouse_movements già corretti nella migration precedente]

-- suppliers — necessari nei form articoli per autocomplete fornitore
CREATE POLICY "Staff can view suppliers if permitted"
  ON public.suppliers FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
