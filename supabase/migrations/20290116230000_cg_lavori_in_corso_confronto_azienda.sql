-- Con un'azienda NULL il confronto <> lascia passare: IS DISTINCT FROM no.
set local lock_timeout = '3s';
do $$
declare v text; vecchio constant text := 'v_company_id <' || '> public.get_my_company_id()';
begin
  select pg_get_functiondef(oid) into v from pg_proc where pronamespace = 'public'::regnamespace and proname = 'cg_lavori_in_corso';
  if v is not null and position(vecchio in v) > 0 then
    execute replace(v, vecchio, 'v_company_id is distinct from public.get_my_company_id()');
  end if;
end $$;
