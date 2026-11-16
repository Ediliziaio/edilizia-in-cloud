-- I costi dei rapportini: l'app e il database con la stessa regola (16/11/2026).
--
-- L'app mostra il blocco «Voci e costi» del popup rapportini a chi ha il permesso Costi
-- OPPURE Gestione acquisti (usePermissions.canViewCosts); il database chiedeva solo
-- can_view_costs. All'ufficio dell'Impresa Vulcano — tre persone con Gestione acquisti e
-- Costi acceso di conseguenza — il salvataggio rispondeva «Le voci con i prezzi le scrive
-- chi può vedere i costi» e il rapportino non si salvava.
--
-- Da qui una regola sola, public.puo_vedere_costi(azienda), la stessa già usata da
-- rapportini_costi e dalle policy di company_costs (20290315100000).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.puo_vedere_costi(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company) is true
      or public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', p_company) is true;
$fn$;

comment on function public.puo_vedere_costi(uuid) is
  'Chi vede i costi di un''azienda: permesso Costi oppure Gestione acquisti, la stessa regola di usePermissions.canViewCosts.';

revoke all on function public.puo_vedere_costi(uuid) from public, anon;
grant execute on function public.puo_vedere_costi(uuid) to authenticated, service_role;

-- Le quattro funzioni del giro rapportini che decidevano col solo can_view_costs.
do $$
declare
  f text;
  cerca text;
  mette text;
  v text;
begin
  for f, cerca, mette in
    select * from (values
      ('public.ufficio_crea_rapportini(uuid,jsonb)',
       E'public.has_permission_for_company(auth.uid(), \'can_view_costs\', c) is not true',
       'public.puo_vedere_costi(c) is not true'),
      ('public.ufficio_leggi_ore(uuid,date,date,boolean)',
       E'public.has_permission_for_company(auth.uid(),\'can_view_costs\',c) is true',
       'public.puo_vedere_costi(c)'),
      ('public.ufficio_da_approvare()',
       E'coalesce(public.has_permission_for_company(auth.uid(), \'can_view_costs\', v_company), false)',
       'public.puo_vedere_costi(v_company)'),
      ('public.voci_abbina_listino(uuid,jsonb,boolean)',
       E'public.has_permission_for_company(auth.uid(), \'can_view_costs\', v_azienda)',
       'public.puo_vedere_costi(v_azienda)')
    ) t(f, cerca, mette)
  loop
    v := pg_get_functiondef(f::regprocedure);
    if position('puo_vedere_costi' in v) > 0 then continue; end if;
    if position(cerca in v) = 0 then
      raise exception 'Testo non riconosciuto in %', f;
    end if;
    execute replace(v, cerca, mette);
  end loop;
end $$;
