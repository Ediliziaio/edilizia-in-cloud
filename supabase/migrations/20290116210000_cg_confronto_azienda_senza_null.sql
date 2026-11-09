-- Con un'azienda NULL il confronto <> lascia passare: IS DISTINCT FROM no.
set local lock_timeout = '3s';
do $$
declare f record; v text; vecchio constant text := 'v_company_id <' || '> public.get_my_company_id()'; n int := 0;
begin
  for f in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cg_ricavi_provenienza', 'cg_voci_non_classificate') loop
    v := pg_get_functiondef(f.oid);
    if position(vecchio in v) = 0 then continue; end if;
    execute replace(v, vecchio, 'v_company_id is distinct from public.get_my_company_id()');
    n := n + 1;
  end loop;
  raise notice 'funzioni corrette: %', n;
end $$;
