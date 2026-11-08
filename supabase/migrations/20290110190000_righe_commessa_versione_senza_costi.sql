-- Righe di commessa senza costi, per il personale d'ufficio che non ha il permesso (08/11/2026).
--
-- `order_items_senza_prezzi`: stesse colonne, costi vuoti, stessa visibilità delle regole della
-- tabella (la vista gira coi diritti del proprietario, le condizioni sono copiate una per una).
-- `a_oi_costi_protetti`: chi non vede i costi riceve la riga col costo vuoto e, salvando la
-- commessa, lo riscriverebbe a zero: su PATCH diretta e `commessa_salva` i costi restano quelli
-- di prima. Le altre funzioni (conferma misure, aggiudicazione) continuano ad aggiornarli.
-- Cantiere e portale clienti non sono toccati: `utente_senza_costi_ufficio` è falsa per loro.
--
-- Nessuna riga viene scritta. Il blocco sulla tabella sta in una migrazione successiva.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.utente_senza_costi_ufficio()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null
     and not public.utente_super_admin()
     and not public.e_solo_campo()
     and not public.utente_e_cliente_esterno()
     and public.get_my_company_id() = any (public.aziende_area(array['can_view_orders','can_edit_orders','can_view_warehouse','can_edit_warehouse'])::uuid[])
     and not (public.get_my_company_id() = any (public.aziende_area(array['can_view_costs','can_manage_purchasing'])::uuid[]));
$function$;
revoke all on function public.utente_senza_costi_ufficio() from public, anon;
grant execute on function public.utente_senza_costi_ufficio() to authenticated;

do $migrazione$
declare
  v_lista text;
begin
  select string_agg(case when a.attname = any(array['purchase_price','standard_cost','costo_stimato_iniziale','deposit_amount','balance_amount','prezzo_prima_ordine'])
                         then format('null::%s as %I', format_type(a.atttypid, a.atttypmod), a.attname)
                         else format('order_items.%I', a.attname) end, ', ' order by a.attnum)
    into v_lista
    from pg_attribute a
   where a.attrelid = 'public.order_items'::regclass and a.attnum > 0 and not a.attisdropped;

  execute format($v$
    create or replace view public.order_items_senza_prezzi with (security_barrier = true) as
    select %s from public.order_items order_items
     where not (select public.utente_bloccato())
       and (
         ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role)) and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid()))))
         or ((select public.has_permission((select auth.uid()), 'can_edit_orders')) and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
             and exists (select 1 from public.orders o where o.id = order_items.order_id and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))
         or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or ((select public.has_permission((select auth.uid()), 'can_view_orders')) and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
             and exists (select 1 from public.orders o where o.id = order_items.order_id))
         or public.user_can_read_accountant_company(public.get_order_company_id(order_id))
         or (public.is_warehouse_user() and destination_warehouse_id = any (public.get_my_warehouse_ids()))
         or exists (select 1 from public.order_campo_assignments oca where oca.order_id = order_items.order_id and oca.user_id = (select auth.uid()))
         or public.get_order_customer_id(order_id) = (select auth.uid())
         or public.order_has_employee_for_user(order_id, (select auth.uid()))
       )$v$, v_lista);
  revoke all on public.order_items_senza_prezzi from public, anon;
  grant select on public.order_items_senza_prezzi to authenticated;
end
$migrazione$;

create or replace function public.order_items_costi_protetti()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_setting('request.path', true) in ('/order_items', '/rpc/commessa_salva') and public.utente_senza_costi_ufficio() then
    new.purchase_price := old.purchase_price;
    new.standard_cost := old.standard_cost;
    new.costo_stimato_iniziale := old.costo_stimato_iniziale;
    new.deposit_amount := old.deposit_amount;
    new.balance_amount := old.balance_amount;
    new.prezzo_prima_ordine := old.prezzo_prima_ordine;
  end if;
  return new;
end;
$function$;
revoke all on function public.order_items_costi_protetti() from public, anon, authenticated;

drop trigger if exists a_oi_costi_protetti on public.order_items;
create trigger a_oi_costi_protetti before update on public.order_items
  for each row execute function public.order_items_costi_protetti();
