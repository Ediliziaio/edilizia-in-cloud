-- ════════════════════════════════════════════════════════════════════════════
-- "Questa persona gestisce QUEL magazzino" adesso restringe davvero
-- ════════════════════════════════════════════════════════════════════════════
-- Terza occorrenza dello stesso difetto (dopo orders e le note marketing): le
-- policy *_scoped_access filtrano per magazzino assegnato, ma accanto vivevano
-- gemelle "if permitted" che filtravano SOLO per azienda. Le policy permissive
-- si sommano in OR → bastava `can_view_warehouse` per vedere i magazzini di
-- tutta Italia, e assegnare una persona a un magazzino non le toglieva niente.
--
-- Regola scelta: chi NON è assegnato ad alcun magazzino resta come oggi
-- (accesso a tutta l'azienda); chi È assegnato a uno o più magazzini vede solo
-- quelli. Non rompe nessuno: al momento del fix le assegnazioni attive in
-- piattaforma erano 0.
--
-- Provato in prod (e rollbackato): utente senza assegnazione 17 giacenze su 17;
-- assegnato al solo magazzino A → 12, senza vedere le 5 del magazzino B.
--
-- Su orders si aggiunge invece check_staff_visibility: la vista "per magazzino"
-- non deve scavalcare "vede solo le commesse assegnate a lui".
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Staff can view warehouse stock if permitted" ON public.warehouse_stock;
CREATE POLICY "Staff can view warehouse stock if permitted"
  ON public.warehouse_stock FOR SELECT TO authenticated
  USING (
    has_permission((SELECT auth.uid()), 'can_view_warehouse')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND (NOT is_warehouse_user() OR warehouse_id = ANY (get_my_warehouse_ids()))
  );

DROP POLICY IF EXISTS "Staff can manage warehouse stock if permitted" ON public.warehouse_stock;
CREATE POLICY "Staff can manage warehouse stock if permitted"
  ON public.warehouse_stock FOR ALL TO authenticated
  USING (
    has_permission((SELECT auth.uid()), 'can_edit_warehouse')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND (NOT is_warehouse_user() OR warehouse_id = ANY (get_my_warehouse_ids()))
  )
  WITH CHECK (
    has_permission((SELECT auth.uid()), 'can_edit_warehouse')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND (NOT is_warehouse_user() OR warehouse_id = ANY (get_my_warehouse_ids()))
  );

DROP POLICY IF EXISTS "Staff can manage warehouse movements if permitted" ON public.warehouse_movements;
CREATE POLICY "Staff can manage warehouse movements if permitted"
  ON public.warehouse_movements FOR ALL TO authenticated
  USING (
    has_permission((SELECT auth.uid()), 'can_edit_warehouse')
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock ws
      WHERE ws.id = warehouse_movements.stock_item_id
        AND ws.company_id = get_user_company_id((SELECT auth.uid()))
    )
    AND (NOT is_warehouse_user() OR warehouse_id = ANY (get_my_warehouse_ids()))
  )
  WITH CHECK (
    has_permission((SELECT auth.uid()), 'can_edit_warehouse')
    AND EXISTS (
      SELECT 1 FROM public.warehouse_stock ws
      WHERE ws.id = warehouse_movements.stock_item_id
        AND ws.company_id = get_user_company_id((SELECT auth.uid()))
    )
    AND (NOT is_warehouse_user() OR warehouse_id = ANY (get_my_warehouse_ids()))
  );

-- La vista "commesse del mio magazzino" non deve scavalcare "solo le mie".
DROP POLICY IF EXISTS "orders_warehouse_user_view" ON public.orders;
CREATE POLICY "orders_warehouse_user_view"
  ON public.orders FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND is_warehouse_user()
    AND order_has_item_in_my_warehouse(id)
    AND check_staff_visibility((SELECT auth.uid()), assigned_to)
  );
