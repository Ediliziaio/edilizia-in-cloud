-- Le righe delle commesse seguono la commessa: «Solo i propri» e «Solo il
-- mio magazzino» valgono anche per voci, allegati, squadre, fasi, provvigioni,
-- compensi e storico degli stati.
--
-- Trovato il 25/09/2026 nell'audit dei permessi, provato in una transazione
-- annullata: queste tabelle guardavano solo il permesso e l'azienda, con
-- get_order_company_id (che non passa dalla RLS di orders) o con company_id.
-- Uno staff con «Solo i propri» che non vede nessuna commessa leggeva 164
-- voci, 66 righe di squadra, 23 fasi e 17 righe di storico di TUTTE le
-- commesse dell'azienda, e modificava voci e allegati di commesse non sue.
--
-- Regola: una riga figlia la vede chi vede la sua commessa (la sottoquery su
-- orders applica a chi legge la RLS di orders), e la modifica chi può
-- modificare le commesse e ha quella commessa tra le sue (can_see_order).
-- Le policy già legate alla commessa con una sottoquery su orders
-- (order_external_teams, order_item_attachments, una delle due su
-- order_status_history) sono già così e restano come sono.
--
-- has_permission NON cambia qui: risponde ancora false a chi non ha il ruolo
-- company_staff (venditori col solo ruolo salesperson, employee,
-- subcontractor). Aprirla adesso darebbe ai subappaltatori, che nascono con
-- «Commesse», preventivi, WhatsApp, compensi e documenti dei clienti di tutta
-- l'azienda, e ai venditori email e automazioni: quelle policy guardano il
-- solo permesso (o l'aggregato can_view_marketing) senza ambito. Va aperta
-- insieme a loro, in un lotto successivo.

set local lock_timeout = '3s';

-- 1. order_items --------------------------------------------------------------
drop policy if exists "Staff can manage order items if permitted" on public.order_items;
create policy "Staff can manage order items if permitted" on public.order_items
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and exists (select 1 from public.orders o where o.id = order_items.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and exists (select 1 from public.orders o where o.id = order_items.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

drop policy if exists order_items_lettura_authenticated on public.order_items;
create policy order_items_lettura_authenticated on public.order_items
  for select to authenticated
  using (
    ((select public.has_permission((select auth.uid()), 'can_view_orders'))
      and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
      and exists (select 1 from public.orders o where o.id = order_items.order_id))
    or public.user_can_read_accountant_company(public.get_order_company_id(order_id))
    or (public.is_warehouse_user() and destination_warehouse_id = any (public.get_my_warehouse_ids()))
  );

-- 2. order_attachments --------------------------------------------------------
drop policy if exists "Staff can manage order attachments if permitted" on public.order_attachments;
create policy "Staff can manage order attachments if permitted" on public.order_attachments
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.user_can_access_company(public.get_order_company_id(order_id))
    and exists (select 1 from public.orders o where o.id = order_attachments.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.user_can_access_company(public.get_order_company_id(order_id))
    and exists (select 1 from public.orders o where o.id = order_attachments.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

drop policy if exists "Staff can view order attachments if permitted" on public.order_attachments;
create policy "Staff can view order attachments if permitted" on public.order_attachments
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_view_orders'))
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and exists (select 1 from public.orders o where o.id = order_attachments.order_id)
  );

-- 3. order_commission_ledger ----------------------------------------------------
drop policy if exists order_commission_ledger_lettura_public on public.order_commission_ledger;
create policy order_commission_ledger_lettura_public on public.order_commission_ledger
  for select to public
  using (
    (public.has_role((select auth.uid()), 'company_admin'::public.app_role)
      and company_id = public.get_user_company_id((select auth.uid())))
    or exists (select 1 from public.salespeople s
                where s.id = order_commission_ledger.salesperson_id and s.user_id = (select auth.uid()))
    or (public.has_permission((select auth.uid()), 'can_view_orders')
      and company_id = public.get_user_company_id((select auth.uid()))
      and exists (select 1 from public.orders o where o.id = order_commission_ledger.order_id))
    or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
  );

-- 4. order_employees ------------------------------------------------------------
drop policy if exists order_employees_lettura_authenticated on public.order_employees;
create policy order_employees_lettura_authenticated on public.order_employees
  for select to authenticated
  using (
    exists (select 1 from public.employees e
             where e.id = order_employees.employee_id and e.user_id = (select auth.uid()))
    or ((select public.has_permission((select auth.uid()), 'can_view_orders'))
      and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
      and exists (select 1 from public.orders o where o.id = order_employees.order_id))
  );

-- 5. order_errors -----------------------------------------------------------------
drop policy if exists "Staff can view order errors if permitted" on public.order_errors;
create policy "Staff can view order errors if permitted" on public.order_errors
  for select to public
  using (
    public.has_permission((select auth.uid()), 'can_view_orders')
    and company_id = public.get_user_company_id((select auth.uid()))
    and exists (select 1 from public.orders o where o.id = order_errors.order_id)
  );

-- 6. order_salespeople --------------------------------------------------------------
drop policy if exists order_salespeople_lettura_authenticated on public.order_salespeople;
create policy order_salespeople_lettura_authenticated on public.order_salespeople
  for select to authenticated
  using (
    exists (select 1 from public.salespeople s
             where s.id = order_salespeople.salesperson_id and s.user_id = (select auth.uid()))
    or (public.has_permission((select auth.uid()), 'can_view_orders')
      and public.get_order_company_id(order_id) = public.get_user_company_id((select auth.uid()))
      and exists (select 1 from public.orders o where o.id = order_salespeople.order_id))
  );

-- 7. order_status_history -------------------------------------------------------------
drop policy if exists order_status_history_lettura_authenticated on public.order_status_history;
create policy order_status_history_lettura_authenticated on public.order_status_history
  for select to authenticated
  using (
    exists (select 1 from public.orders o
             where o.id = order_status_history.order_id and o.customer_id = (select auth.uid()))
    or ((select public.has_permission((select auth.uid()), 'can_view_orders'))
      and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
      and exists (select 1 from public.orders o where o.id = order_status_history.order_id))
  );

-- 8. order_variable_compensations -------------------------------------------------------
drop policy if exists "Company staff can manage variable compensations" on public.order_variable_compensations;
create policy "Company staff can manage variable compensations" on public.order_variable_compensations
  for all to public
  using (
    public.has_permission((select auth.uid()), 'can_edit_orders')
    and company_id = public.get_user_company_id((select auth.uid()))
    and exists (select 1 from public.orders o where o.id = order_variable_compensations.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    public.has_permission((select auth.uid()), 'can_edit_orders')
    and company_id = public.get_user_company_id((select auth.uid()))
    and exists (select 1 from public.orders o where o.id = order_variable_compensations.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

drop policy if exists "Company staff can view variable compensations" on public.order_variable_compensations;
create policy "Company staff can view variable compensations" on public.order_variable_compensations
  for select to public
  using (
    public.has_permission((select auth.uid()), 'can_view_orders')
    and company_id = public.get_user_company_id((select auth.uid()))
    and exists (select 1 from public.orders o where o.id = order_variable_compensations.order_id)
  );

-- 9. order_work_phases ----------------------------------------------------------------
drop policy if exists "Staff can manage order work phases if permitted" on public.order_work_phases;
create policy "Staff can manage order work phases if permitted" on public.order_work_phases
  for all to public
  using (
    public.has_permission((select auth.uid()), 'can_edit_orders')
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and exists (select 1 from public.orders o where o.id = order_work_phases.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    public.has_permission((select auth.uid()), 'can_edit_orders')
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and exists (select 1 from public.orders o where o.id = order_work_phases.order_id
                 and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

drop policy if exists order_work_phases_lettura_public on public.order_work_phases;
create policy order_work_phases_lettura_public on public.order_work_phases
  for select to public
  using (
    exists (select 1 from public.order_campo_assignments oca
             where oca.order_id = order_work_phases.order_id and oca.user_id = (select auth.uid()))
    or public.order_has_employee_for_user(order_id, (select auth.uid()))
    or (public.has_permission((select auth.uid()), 'can_view_orders')
      and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
      and exists (select 1 from public.orders o where o.id = order_work_phases.order_id))
  );
