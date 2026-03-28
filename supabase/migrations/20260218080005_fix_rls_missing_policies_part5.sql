-- ─────────────────────────────────────────────────────────────
-- 4. warehouse_movements  [CRITICO]
-- ─────────────────────────────────────────────────────────────

-- Senza questa policy, il personale con permesso can_edit_warehouse
-- non può registrare scarichi/carichi magazzino — operazione che
-- avviene ogni volta che un articolo ordine cambia stato.

CREATE POLICY "Staff can manage warehouse movements if permitted"
  ON public.warehouse_movements FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_warehouse'::text)
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock ws
      WHERE ws.id = warehouse_movements.stock_item_id
        AND ws.company_id = get_user_company_id(auth.uid())
    )
  );
