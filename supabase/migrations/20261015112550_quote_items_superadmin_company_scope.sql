-- Same write authority as quotes: impersonating an existing company does not
-- change a superadmin's home company. Never bypass RLS in the save RPC.
-- Require the item's company to match its parent quote for EVERY role.
set local lock_timeout = '3s';

drop policy if exists qi_sel on public.quote_items;
create policy qi_sel on public.quote_items for select to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id)
);

drop policy if exists qi_ins on public.quote_items;
create policy qi_ins on public.quote_items for insert to authenticated
with check (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

drop policy if exists qi_upd on public.quote_items;
create policy qi_upd on public.quote_items for update to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
)
with check (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

drop policy if exists qi_del on public.quote_items;
create policy qi_del on public.quote_items for delete to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

-- Failed new-quote saves must be compensatable for the same superadmin that
-- could create the header; normal company admins retain their existing scope.
drop policy if exists q_del on public.quotes;
create policy q_del on public.quotes for delete to authenticated
using (
  (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (company_id = (select public.get_my_company_id())
      and (select public.e_amministratore_di(public.get_my_company_id())))
);
