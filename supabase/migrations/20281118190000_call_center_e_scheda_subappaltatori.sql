-- Due decisioni del 03/11/2026.
--
-- 1) Il Call Center non vede gli ordini ai fornitori. Dashboard e Calendario glieli aprivano senza che
--    le sue pagine li usino. Per chi ha il ruolo call_center quei due permessi non contano più; se ha
--    Commesse, Magazzino o un altro permesso dell'elenco continua a vederli, come chiunque. Per tutti
--    gli altri ruoli l'elenco non cambia.
--
-- 2) Chi ha la scheda Subappaltatori consulta contratti, SAL, verbali, ritenute e fatture collegate.
--    Prima servivano Costi insieme a «Documenti mensili», che nessuno staff delle aziende reali ha.
--    Regole di sola lettura, in aggiunta alle esistenti: scrivere richiede ancora i permessi di prima.
--    LUL, F24 e documenti mensili restano riservati. Operai e subappaltatori esterni ne restano fuori,
--    anche se il loro modello ha il permesso: quei dati sono dell'azienda, non di chi lavora in cantiere.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.utente_call_center()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = auth.uid() and r.role::text = 'call_center'
  )
$$;
revoke all on function public.utente_call_center() from public, anon;
grant execute on function public.utente_call_center() to authenticated, service_role;

do $mig$
declare
  v_regola text := '(select public.utente_super_admin())'
    || ' or company_id = any ((select public.aziende_area(array[''can_view_orders'',''can_edit_orders'',''can_view_warehouse'',''can_edit_warehouse'',''can_manage_suppliers'',''can_manage_purchasing'',''can_validate_bom'',''can_view_costs'',''can_view_billing'',''can_view_financial_reports'',''can_view_scadenzario'',''can_view_tickets'',''can_edit_tickets'',''can_view_cruscotto'',''can_view_settings_suppliers'',''can_view_forecast'',''can_view_tesoreria'',''can_view_subappaltatori'']::text[]))::uuid[])'
    || ' or (not (select public.utente_call_center()) and company_id = any ((select public.aziende_area(array[''can_view_dashboard'',''can_view_calendar'']::text[]))::uuid[]))';
  v_tabella text;
begin
  foreach v_tabella in array array['purchase_orders', 'purchase_order_items'] loop
    if exists (select 1 from pg_policy where polrelid = ('public.' || v_tabella)::regclass and polname = 'permessi_area') then
      execute format('alter policy permessi_area on public.%I using (%s) with check (%s)', v_tabella, v_regola, v_regola);
    else
      execute format('create policy permessi_area on public.%I as restrictive for all to authenticated using (%s) with check (%s)', v_tabella, v_regola, v_regola);
    end if;
  end loop;
end $mig$;

-- Serve anche alla funzione del verbale, che gira con la chiave di servizio: per questo prende l'utente.
create or replace function public.puo_consultare_sal_sub(_user_id uuid, _company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (public.has_permission_for_company(_user_id, 'can_view_costs', _company_id)
      and public.has_permission_for_company(_user_id, 'can_view_subappaltatori_amministrazione', _company_id))
    or (public.has_permission_for_company(_user_id, 'can_view_subappaltatori', _company_id)
      and exists (select 1 from public.user_roles r where r.user_id = _user_id and r.role::text not in ('employee', 'subcontractor')))
$$;
revoke all on function public.puo_consultare_sal_sub(uuid, uuid) from public, anon, authenticated;
grant execute on function public.puo_consultare_sal_sub(uuid, uuid) to service_role;

do $mig$
declare
  v_voce record;
  v_base text := 'company_id = any ((select public.aziende_con_permesso(''can_view_subappaltatori''))::uuid[]) and not (select public.e_solo_campo())';
begin
  for v_voce in
    select * from (values
      ('contratti_subappalto', null),
      ('sal_subappaltatori', null),
      ('sal_sub_verbali', null),
      ('sal_sub_pagamenti', null),
      ('subappalto_quadri_lavori', null),
      ('subappalto_misure', null),
      ('subappalto_varianti_contratto', null),
      ('subappalto_contratti_carta', null),
      -- Solo le ritenute di un contratto e le fatture collegate: il resto è contabilità generale.
      ('ritenute_garanzia', 'contratto_id is not null'),
      ('fatture_ricevute', '(contratto_subappalto_id is not null or sal_subappaltatore_id is not null)')
    ) as t(tabella, limite)
  loop
    if not exists (select 1 from pg_policy where polrelid = ('public.' || v_voce.tabella)::regclass and polname = 'scheda_subappaltatori_leggi') then
      execute format(
        'create policy scheda_subappaltatori_leggi on public.%I for select to authenticated using (%s)',
        v_voce.tabella,
        v_base || coalesce(' and ' || v_voce.limite, ''));
    end if;
  end loop;
end $mig$;

-- Codice e descrizione della commessa di un contratto, senza importi: chi non ha Commesse non legge
-- la tabella degli ordini, ma il contratto deve poter dire a quale cantiere si riferisce.
create or replace function public.subappalto_etichette_commesse(p_order_ids uuid[])
returns table (order_id uuid, order_code text, description text, work_address text, client_name text, client_company text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code::text, o.description::text, o.work_address::text, o.client_name::text, o.client_company::text
    from public.orders o
   where o.id = any (p_order_ids)
     and not public.e_solo_campo()
     and o.company_id = any (public.aziende_con_permesso('can_view_subappaltatori'))
     and exists (select 1 from public.contratti_subappalto c where c.order_id = o.id and c.company_id = o.company_id)
$$;
revoke all on function public.subappalto_etichette_commesse(uuid[]) from public, anon;
grant execute on function public.subappalto_etichette_commesse(uuid[]) to authenticated, service_role;
