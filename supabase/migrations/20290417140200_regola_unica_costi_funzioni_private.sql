-- Chi vede i costi: la stessa regola anche nello schema private (16/11/2026).
-- Quattro funzioni di servizio decidevano col solo `can_view_costs`: i collegamenti del
-- movimento bancario al fornitore, «chi decide sulle bollette» (la scheda Utenze si apre
-- con canViewCosts) e l'economia del rapportino.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare f regprocedure; v text; nuovo text; n int := 0;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'private' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%can_view_costs%'
      and pg_get_functiondef(p.oid) not ilike '%can_manage_purchasing%'
  loop
    v := pg_get_functiondef(f);
    nuovo := regexp_replace(v,
      'public\.has_permission_for_company\(\s*([^,]+?)\s*,\s*''can_view_costs''(::text)?\s*,\s*((?:[a-z_]+\([^()]*\))|[^),]+?)\s*\)',
      'public.puo_vedere_costi(\1, \3)', 'gi');
    nuovo := replace(nuovo, 'public.aziende_con_permesso(''can_view_costs'')',
                     'public.aziende_con_uno_dei_permessi(array[''can_view_costs'', ''can_manage_purchasing''])');
    if nuovo = v then raise exception 'Nessuna sostituzione in %', f; end if;
    execute nuovo;
    n := n + 1;
  end loop;
  raise notice 'Funzioni private convertite: %', n;
end $$;

do $$
declare v text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'private' and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike '%can_view_costs%'
    and pg_get_functiondef(p.oid) not ilike '%can_manage_purchasing%';
  if v is not null then raise exception 'Restano funzioni private con la vecchia regola: %', v; end if;
end $$;
