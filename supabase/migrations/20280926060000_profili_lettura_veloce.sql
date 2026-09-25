-- La lettura dei profili: gli stessi profili di prima, in pochi millisecondi
-- invece di quasi un secondo.
--
-- Misurato il 26/09/2026: per uno staff (non amministratore) leggere i
-- profili costava circa 910 ms, perché la policy chiamava
-- can_view_company_people(company_id) per OGNI riga della tabella (1.041
-- chiamate, circa 0,9 ms l'una), anche per le righe delle altre aziende.
-- La tabella si legge in quasi ogni pagina (nomi di assegnatari, autori,
-- squadre): era un secondo in più su tutto.
--
-- Ora le aziende in cui l'utente vede le persone si calcolano una volta per
-- lettura (aziende_dove_vedo_persone: amministratore dell'azienda, accesso
-- multi-azienda attivo da amministratore o con la gestione delle persone,
-- come can_view_company_people), e nel ramo dei clienti il controllo che
-- costa meno viene per primo. Il super admin è già coperto dalla sua policy
-- («Super admins can do everything with profiles»). Gli utenti vedono
-- esattamente i profili di prima (provato prima e dopo, stessi numeri).

set local lock_timeout = '3s';

create or replace function public.aziende_dove_vedo_persone()
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(array(
    select x from (
      select public.get_user_company_id(auth.uid()) as x
       where public.has_role(auth.uid(), 'company_admin'::public.app_role)
      union
      select mca.company_id
        from public.multi_company_access mca
        left join public.staff_permissions sp on sp.user_id = auth.uid() and sp.company_id = mca.company_id
       where mca.user_id = auth.uid()
         and mca.status = 'active'
         and (mca.expires_at is null or mca.expires_at > now())
         and (mca.access_role = 'company_admin'
              or coalesce(sp.can_view_settings_people, false)
              or coalesce(sp.can_view_users, false))
    ) aziende where x is not null
  ), '{}');
$function$;
revoke all on function public.aziende_dove_vedo_persone() from public, anon;
grant execute on function public.aziende_dove_vedo_persone() to authenticated, service_role;

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
    or (company_id in (select unnest(public.aziende_dove_vedo_persone()))
        and not (select public.utente_e_cliente_esterno()))
    or ((select public.has_permission((select auth.uid()), 'can_view_orders'))
        and company_id = (select public.get_user_company_id((select auth.uid())))
        and not (select public.utente_e_cliente_esterno()))
    or (id = (select auth.uid()))
    or (company_id = (select public.get_user_company_id((select auth.uid())))
        and not (select public.utente_e_cliente_esterno())
        and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
               'can_view_customers', 'can_view_orders', 'can_view_preventivi', 'can_view_marketing_contacts',
               'can_manage_portal', 'can_view_tickets', 'can_view_persone', 'can_view_settings_people'])))
             or not public.profilo_solo_cliente(id)
             or public.cliente_di_una_mia_commessa(id)))
  );
