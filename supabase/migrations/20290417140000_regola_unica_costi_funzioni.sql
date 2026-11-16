-- Chi vede i costi: una regola sola in tutte le funzioni (16/11/2026).
--
-- Seguito di 20290417090000: lì erano le quattro funzioni dei rapportini, qui tutte le
-- altre che decidevano col solo `can_view_costs` mentre l'app apre la stessa cosa con
-- `canViewCosts` = Costi OPPURE Gestione acquisti. Ogni differenza fra le due regole è un
-- pulsante che si preme e non succede niente, o un elenco vuoto senza un errore.
--
-- Restano fuori, di proposito, le funzioni dove `can_view_costs` è una voce in un elenco
-- di permessi di finanza e amministrazione (`puo_vedere_finanza`, `puo_vedere_scadenze`,
-- `_cg_assert_lettura`, `puo_vedere_documenti_fornitore`, `puo_caricare_fattura_ricevuta`)
-- e `has_cost_permission`, che è il vecchio meccanismo per soli amministratori: aprirle
-- darebbe a chi gestisce gli acquisti la contabilità, che l'app non gli mostra.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- La regola, anche per un utente diverso da chi chiama.
create or replace function public.puo_vedere_costi(p_user uuid, p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.has_permission_for_company(p_user, 'can_view_costs', p_company) is true
      or public.has_permission_for_company(p_user, 'can_manage_purchasing', p_company) is true;
$fn$;

create or replace function public.puo_vedere_costi(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.puo_vedere_costi(auth.uid(), p_company);
$fn$;

comment on function public.puo_vedere_costi(uuid, uuid) is
  'Chi vede i costi di un''azienda: permesso Costi oppure Gestione acquisti, la stessa regola di usePermissions.canViewCosts.';

revoke all on function public.puo_vedere_costi(uuid, uuid) from public, anon;
grant execute on function public.puo_vedere_costi(uuid, uuid) to authenticated, service_role;

-- Un caso a parte: qui il permesso è scelto da un CASE (scrittura/lettura).
do $$
declare v text;
begin
  v := pg_get_functiondef('public._piano_cantiere_controlla(uuid,boolean)'::regprocedure);
  if position('puo_vedere_costi' in v) = 0 then
    if position(E'CASE WHEN p_scrittura THEN \'can_edit_orders\' ELSE \'can_view_costs\' END, p_company_id)' in v) = 0 then
      raise exception 'testo non riconosciuto in _piano_cantiere_controlla';
    end if;
    v := replace(v,
      E'public.has_permission_for_company(auth.uid(), CASE WHEN p_scrittura THEN \'can_edit_orders\' ELSE \'can_view_costs\' END, p_company_id)',
      E'(CASE WHEN p_scrittura THEN public.has_permission_for_company(auth.uid(), \'can_edit_orders\', p_company_id) ELSE public.puo_vedere_costi(p_company_id) END)');
    execute v;
  end if;
end $$;

-- Tutte le altre: sostituzione meccanica delle due forme in cui il controllo è scritto.
do $$
declare
  f regprocedure;
  v text;
  nuovo text;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%can_view_costs%'
      and pg_get_functiondef(p.oid) not ilike '%can_manage_purchasing%'
      and p.proname not in ('_cg_assert_lettura', 'puo_vedere_finanza', 'puo_vedere_scadenze',
                            'puo_vedere_documenti_fornitore', 'puo_caricare_fattura_ricevuta',
                            'has_cost_permission', 'puo_vedere_costi')
  loop
    v := pg_get_functiondef(f);
    nuovo := regexp_replace(v,
      'public\.has_permission_for_company\(\s*([^,]+?)\s*,\s*''can_view_costs''(::text)?\s*,\s*([^),]+?)\s*\)',
      'public.puo_vedere_costi(\1, \3)', 'gi');
    nuovo := replace(nuovo, 'public.aziende_con_permesso(''can_view_costs'')',
                     'public.aziende_con_uno_dei_permessi(array[''can_view_costs'', ''can_manage_purchasing''])');
    if nuovo = v then
      raise exception 'Nessuna sostituzione in %', f;
    end if;
    execute nuovo;
    n := n + 1;
  end loop;
  raise notice 'Funzioni convertite: %', n;
end $$;

-- Controllo: nessuna funzione resta con la vecchia regola, tolte quelle lasciate apposta.
do $$
declare v text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike '%can_view_costs%'
    and pg_get_functiondef(p.oid) not ilike '%can_manage_purchasing%'
    and p.proname not in ('_cg_assert_lettura', 'puo_vedere_finanza', 'puo_vedere_scadenze',
                          'puo_vedere_documenti_fornitore', 'puo_caricare_fattura_ricevuta',
                          'has_cost_permission', 'puo_vedere_costi');
  if v is not null then
    raise exception 'Restano funzioni con la vecchia regola: %', v;
  end if;
end $$;
