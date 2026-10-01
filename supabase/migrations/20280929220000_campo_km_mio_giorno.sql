create or replace function public.campo_km_mio_giorno(p_giorno date)
returns table (km numeric, importo numeric, tariffa numeric, cantieri integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_company uuid; v_profilo uuid;
begin
  select company_id into v_company from public.profiles where id = auth.uid();
  if v_company is null then return query select 0::numeric, 0::numeric, 0::numeric, 0; return; end if;
  v_profilo := public.hr_profilo_da_user(auth.uid(), v_company);
  if v_profilo is null then return query select 0::numeric, 0::numeric, 0::numeric, 0; return; end if;
  return query select * from public.campo_km_suggeriti(v_profilo, p_giorno);
end $$;
revoke all on function public.campo_km_mio_giorno(date) from public, anon;
grant execute on function public.campo_km_mio_giorno(date) to authenticated, service_role;
