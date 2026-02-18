-- =============================================================
-- RLS: accesso basato su sezione per ruoli company_staff,
--      employee e salesperson
--
-- Problema: il frontend usa usePermissions() per nascondere/mostrare
-- sezioni, ma il DB non applicava le stesse regole — staff con
-- can_view_orders otteneva risultati vuoti perché mancavano
-- policy RLS sulla tabella orders e su molte tabelle correlate.
--
-- Questo file aggiunge le policy mancanti mantenendo il principio:
--   company_admin / super_admin  → has_permission() ritorna sempre true
--   company_staff               → verifica la colonna in staff_permissions
--   salesperson                 → può vedere i propri ordini assegnati
--   employee                    → può vedere gli ordini a cui è assegnato
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- SEZIONE ORDINI  (can_view_orders / can_edit_orders)
-- ─────────────────────────────────────────────────────────────

-- 1. orders — il gap più critico: staff non vedeva nessun ordine
CREATE POLICY "Staff can view their company orders"
  ON public.orders FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Staff can manage their company orders"
  ON public.orders FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Venditori vedono gli ordini su cui sono assegnati
CREATE POLICY "Salespeople can view their assigned orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_salespeople os
      JOIN public.salespeople s ON s.id = os.salesperson_id
      WHERE os.order_id = orders.id
        AND s.user_id = auth.uid()
    )
  );

-- Dipendenti vedono gli ordini a cui sono assegnati
CREATE POLICY "Employees can view their assigned orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE oe.order_id = orders.id
        AND e.user_id = auth.uid()
    )
  );

-- 2. order_statuses — necessari per visualizzare i nomi degli stati (Kanban)
CREATE POLICY "Staff can view their company order statuses"
  ON public.order_statuses FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

-- 3. order_status_history — log cambi stato visibile allo staff
CREATE POLICY "Staff can view their company order status history"
  ON public.order_status_history FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- 4. order_employees — assegnazione dipendenti agli ordini
CREATE POLICY "Staff can view order employees if permitted"
  ON public.order_employees FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_employees.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- Dipendenti vedono le proprie assegnazioni
CREATE POLICY "Employees can view their own order assignments"
  ON public.order_employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = order_employees.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- 5. order_attachments — allegati a livello ordine
CREATE POLICY "Staff can view order attachments if permitted"
  ON public.order_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_attachments.order_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- 6. order_item_attachments — allegati agli articoli ordine
CREATE POLICY "Staff can view order item attachments if permitted"
  ON public.order_item_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_attachments.order_item_id
        AND o.company_id = get_user_company_id(auth.uid())
    )
  );


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


-- ─────────────────────────────────────────────────────────────
-- SEZIONE CLIENTI  (can_view_customers / can_edit_customers)
-- ─────────────────────────────────────────────────────────────

-- profiles — lo staff che vede ordini deve poter leggere i profili
-- cliente (nome, telefono, indirizzo) collegati agli ordini
CREATE POLICY "Staff can view company profiles if permitted"
  ON public.profiles FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- SEZIONE DIPENDENTI  (can_view_employees)
-- ─────────────────────────────────────────────────────────────

-- employee_attachments — staff con can_view_employees vede i documenti
CREATE POLICY "Staff can view employee attachments if permitted"
  ON public.employee_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_employees'::text)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_attachments.employee_id
        AND e.company_id = get_user_company_id(auth.uid())
    )
  );

-- Dipendenti vedono i propri allegati (buste paga, documenti, ecc.)
CREATE POLICY "Employees can view their own attachments"
  ON public.employee_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_attachments.employee_id
        AND e.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────
-- SEZIONE SQUADRE ESTERNE  (visibile via can_view_orders)
-- ─────────────────────────────────────────────────────────────

-- external_teams — lista squadre (necessaria nei dettagli ordine)
CREATE POLICY "Staff can view external teams if permitted"
  ON public.external_teams FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

-- external_team_attachments — documenti contratti squadre esterne
CREATE POLICY "Staff can view external team attachments if permitted"
  ON public.external_team_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.external_teams t
      WHERE t.id = external_team_attachments.external_team_id
        AND t.company_id = get_user_company_id(auth.uid())
    )
  );
