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

-- Company staff con permesso can_edit_orders può gestire gli articoli
-- degli ordini della propria azienda
CREATE POLICY "Staff can manage order items if permitted"
  ON public.order_items FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- Dipendenti (ruolo employee) possono vedere gli articoli degli ordini
-- a cui sono assegnati tramite order_employees
CREATE POLICY "Employees can view items of their assigned orders"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE e.user_id = auth.uid()
        AND oe.order_id = order_items.order_id
    )
  );


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
