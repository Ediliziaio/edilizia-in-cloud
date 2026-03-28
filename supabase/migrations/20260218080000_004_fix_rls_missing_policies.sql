-- ─────────────────────────────────────────────────────────────
-- 3. warehouse_stock
-- ─────────────────────────────────────────────────────────────

-- La policy SELECT per staff era già presente ma mancava la gestione
-- completa (INSERT/UPDATE/DELETE) per chi ha can_edit_warehouse.
-- Nota: FOR ALL su has_permission copre già SELECT, ma Postgres
-- combina le policy in OR — la policy SELECT esistente rimane attiva.

CREATE POLICY "Staff can manage warehouse stock if permitted"
  ON public.warehouse_stock FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_warehouse'::text)
    AND company_id = get_user_company_id(auth.uid())
  );
