-- Profili dei clienti del portale: li vede chi lavora coi clienti, non ogni
-- interno. I profili dei colleghi restano visibili a tutti gli interni (nomi
-- di assegnatari, chat, calendario).
--
-- Trovato il 25/09/2026 nell'audit dei permessi: profiles_lettura_authenticated
-- finiva con «stessa azienda e non cliente del portale», quindi chiunque
-- interno leggeva i profili di tutti i clienti dell'azienda, con telefono e
-- indirizzo (in un'azienda 471 su 473). Dieci utenti senza nessun permesso
-- sui clienti (dipendenti di cantiere, un centralinista, un subappaltatore)
-- ne leggevano 2.896.
--
-- Ora il profilo di un cliente lo vede:
--   - chi ha Clienti, Commesse, Preventivi, Contatti, Portale, Ticket o la
--     gestione delle persone (le pagine dove i clienti compaiono);
--   - chi lavora a una commessa di quel cliente (assegnata, in squadra, sul
--     campo, venditore): il dipendente in cantiere vede ancora l'indirizzo e
--     il telefono del cliente del suo lavoro;
--   - l'amministratore, e il cliente stesso.
-- «Lavora a una commessa del cliente» lo guarda una funzione SECURITY
-- DEFINER, non una sottoquery su orders: la RLS di orders legge
-- order_campo_assignments, che legge profiles, e il giro sarebbe una
-- ricorsione.

set local lock_timeout = '3s';

create or replace function public.profilo_solo_cliente(_profilo_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.user_roles r
                  where r.user_id = _profilo_id and r.role = 'customer'::public.app_role)
     and not exists (select 1 from public.user_roles r
                      where r.user_id = _profilo_id and r.role <> 'customer'::public.app_role);
$function$;
revoke all on function public.profilo_solo_cliente(uuid) from public, anon;
grant execute on function public.profilo_solo_cliente(uuid) to authenticated, service_role;

create or replace function public.cliente_di_una_mia_commessa(_cliente_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null
     and exists (
       select 1 from public.orders o
        where o.customer_id = _cliente_id
          and o.company_id = public.get_my_company_id()
          and (o.assigned_to = auth.uid()
               or public.order_has_employee_for_user(o.id, auth.uid())
               or public.order_has_salesperson_for_user(o.id, auth.uid())
               or exists (select 1 from public.order_campo_assignments oca
                           where oca.order_id = o.id and oca.user_id = auth.uid())));
$function$;
revoke all on function public.cliente_di_una_mia_commessa(uuid) from public, anon;
grant execute on function public.cliente_di_una_mia_commessa(uuid) to authenticated, service_role;

drop policy if exists profiles_lettura_authenticated on public.profiles;
create policy profiles_lettura_authenticated on public.profiles
  for select to authenticated
  using (
    ((select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      and company_id = (select public.get_user_company_id((select auth.uid())))
      and not (select public.utente_e_cliente_esterno()))
    or (exists (select 1 from public.multi_company_access mca
                 where mca.user_id = profiles.id and public.can_view_company_people(mca.company_id))
        and not (select public.utente_e_cliente_esterno()))
    or (public.can_view_company_people(company_id) and not (select public.utente_e_cliente_esterno()))
    or ((select public.has_permission((select auth.uid()), 'can_view_orders'))
        and company_id = (select public.get_user_company_id((select auth.uid())))
        and not (select public.utente_e_cliente_esterno()))
    or (id = (select auth.uid()))
    or (company_id = (select public.get_user_company_id((select auth.uid())))
        and not (select public.utente_e_cliente_esterno())
        and (not public.profilo_solo_cliente(id)
             or company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                  'can_view_customers', 'can_view_orders', 'can_view_preventivi', 'can_view_marketing_contacts',
                  'can_manage_portal', 'can_view_tickets', 'can_view_persone', 'can_view_settings_people'])))
             or public.cliente_di_una_mia_commessa(id)))
  );
