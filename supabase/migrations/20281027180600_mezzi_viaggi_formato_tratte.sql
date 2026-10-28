set local lock_timeout='3s';
set local statement_timeout='60s';
-- Shape guard at the storage boundary: RPC callers cannot persist JSON strings
-- as numbers or objects as labels, and unknown keys are not copied to clients.
create or replace function public.mezzi_viaggi_valida_tratte() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare t jsonb; risultato jsonb:='[]'::jsonb;
begin
 if not exists(select 1 from public.mezzi m where m.id=new.mezzo_id and m.company_id=new.company_id) then raise exception 'Mezzo di altra azienda'; end if;
 if new.conducente_hr_id is not null and not exists(select 1 from public.hr_profili hp where hp.id=new.conducente_hr_id and hp.company_id=new.company_id) then raise exception 'Conducente di altra azienda'; end if;
 if jsonb_typeof(new.tratte) is distinct from 'array' or jsonb_array_length(new.tratte) not between 1 and 30 then raise exception 'Elenco tratte non valido'; end if;
 for t in select value from jsonb_array_elements(new.tratte) loop
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'id') is distinct from 'string'
    or jsonb_typeof(t->'da') is distinct from 'string' or jsonb_typeof(t->'a') is distinct from 'string'
    or coalesce(jsonb_typeof(t->'order_id'),'null') not in ('string','null')
    or coalesce(jsonb_typeof(t->'km'),'null') not in ('number','null')
    or coalesce(jsonb_typeof(t->'minuti'),'null') not in ('number','null') then raise exception 'Formato della tratta non valido: km e minuti devono essere numeri, i luoghi devono essere testo'; end if;
  if nullif(t->>'order_id','') is not null and not exists(select 1 from public.orders o where o.id=(t->>'order_id')::uuid and o.company_id=new.company_id) then raise exception 'Commessa di altra azienda'; end if;
  risultato:=risultato||jsonb_build_array(jsonb_build_object('id',t->>'id','da',trim(t->>'da'),'a',trim(t->>'a'),
    'order_id',(t->>'order_id')::uuid,'km',(t->>'km')::numeric,'minuti',(t->>'minuti')::numeric,
    'destinazione',t->>'destinazione','fonte',t->>'fonte'));
 end loop;
 new.tratte:=risultato;
 return new;
end $$;
revoke all on function public.mezzi_viaggi_valida_tratte() from public,anon,authenticated;
drop trigger if exists mezzi_viaggi_tratte_corrette on public.mezzi_viaggi;
create trigger mezzi_viaggi_tratte_corrette before insert or update on public.mezzi_viaggi for each row execute function public.mezzi_viaggi_valida_tratte();
