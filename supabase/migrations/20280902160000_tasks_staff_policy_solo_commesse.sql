-- Attività: lo staff con permesso "commesse" vedeva (e con can_edit_orders poteva
-- modificare) via API TUTTE le attività dell'azienda, anche quelle non legate a
-- una commessa e assegnate ad altri. Il frontend le nascondeva già (filtro
-- assigned_to = me senza "Attività del team"), quindi era un varco solo via API.
-- Ora la policy "commesse" copre le attività DI COMMESSA (order_id non nullo),
-- le proprie e quelle create da sé. Il permesso esplicito can_view_team_tasks
-- resta la via per vedere il team (policy separata, non toccata).
-- Idempotente: drop + create.

drop policy if exists "Staff can view tasks if permitted" on public.tasks;
create policy "Staff can view tasks if permitted" on public.tasks
  for select to authenticated
  using (
    has_permission((select auth.uid()), 'can_view_orders')
    and company_id = get_user_company_id((select auth.uid()))
    and check_staff_visibility((select auth.uid()), assigned_to)
    and (order_id is not null or assigned_to = (select auth.uid()) or created_by = (select auth.uid()))
  );

drop policy if exists "Staff can manage tasks if permitted" on public.tasks;
create policy "Staff can manage tasks if permitted" on public.tasks
  for all to authenticated
  using (
    has_permission((select auth.uid()), 'can_edit_orders')
    and company_id = get_user_company_id((select auth.uid()))
    and check_staff_visibility((select auth.uid()), assigned_to)
    and (order_id is not null or assigned_to = (select auth.uid()) or created_by = (select auth.uid()))
  )
  with check (
    has_permission((select auth.uid()), 'can_edit_orders')
    and company_id = get_user_company_id((select auth.uid()))
    and check_staff_visibility((select auth.uid()), assigned_to)
    and (order_id is not null or assigned_to = (select auth.uid()) or created_by = (select auth.uid()))
  );
