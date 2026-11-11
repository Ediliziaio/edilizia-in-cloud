-- La testata e le righe usano lo stesso permesso Acquisti, anche per le
-- consegne dirette in cantiere, senza richiedere un magazzino assegnato.
create or replace function public.puo_vedere_ddt(p_ddt uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.ddt_ricezione d
    where d.id = p_ddt and (
      (d.company_id = public.get_my_company_id() and (
        public.e_amministratore_di(public.get_my_company_id())
        or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
        or d.warehouse_id = any (public.get_my_warehouse_ids())
      ))
      or (
        not public.utente_bloccato()
        and not public.utente_e_cliente_esterno()
        and d.company_id = any (public.aziende_con_permesso('can_manage_purchasing'))
      )
    )
  );
$fn$;
comment on function public.puo_vedere_ddt(uuid) is
  'Accesso alla bolla e alle sue righe: accessi storici oppure permesso Acquisti della specifica azienda.';
revoke all on function public.puo_vedere_ddt(uuid) from public, anon;
grant execute on function public.puo_vedere_ddt(uuid) to authenticated, service_role;

create policy ddt_ricezione_acquisti_inserisce on public.ddt_ricezione
for insert to authenticated with check (
  not public.utente_bloccato() and not public.utente_e_cliente_esterno()
  and not public.utente_sola_lettura(company_id)
  and company_id = any (public.aziende_con_permesso('can_manage_purchasing'))
);
create policy ddt_ricezione_acquisti_modifica on public.ddt_ricezione
for update to authenticated using (
  not public.utente_bloccato() and not public.utente_e_cliente_esterno()
  and not public.utente_sola_lettura(company_id)
  and company_id = any (public.aziende_con_permesso('can_manage_purchasing'))
) with check (
  not public.utente_bloccato() and not public.utente_e_cliente_esterno()
  and not public.utente_sola_lettura(company_id)
  and company_id = any (public.aziende_con_permesso('can_manage_purchasing'))
);
