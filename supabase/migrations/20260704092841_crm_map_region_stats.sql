-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Mappa CRM · analytics geografica: conteggi per regione (clienti/prospect) per
-- il pannello "Analisi per regione". Aggrega companies + marketing_contacts con
-- la stessa logica cliente/prospect delle altre RPC mappa.
create or replace function public.crm_map_region_stats(p_company uuid)
returns table (regione text, n bigint, n_clienti bigint, n_prospect bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  pts as (
    select nullif(trim(c.region), '') as regione, true as is_cliente
    from public.companies c
    where c.is_platform_admin_company is not true
    union all
    select nullif(trim(m.region), ''), (sc2.contact_id is not null)
    from public.marketing_contacts m
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  )
  select coalesce(p.regione, 'Sconosciuta') as regione,
         count(*) as n,
         count(*) filter (where p.is_cliente) as n_clienti,
         count(*) filter (where not p.is_cliente) as n_prospect
  from pts p
  group by 1
  order by n desc;
end; $$;
grant execute on function public.crm_map_region_stats(uuid) to authenticated;
