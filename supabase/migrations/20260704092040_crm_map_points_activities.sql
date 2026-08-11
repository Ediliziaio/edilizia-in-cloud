-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

drop function if exists public.crm_map_points_bbox(uuid,double precision,double precision,double precision,double precision,int);

create or replace function public.crm_map_points_bbox(
  p_company uuid,
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 2000
) returns table (
  id text, tipo text, nome text, categoria text, stato text, temperatura text,
  fatturato numeric, email text, telefono text, citta text, provincia text, regione text, indirizzo text,
  lat double precision, lng double precision, precise boolean, attivita jsonb
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  pts as (
    select ('comp-'||c.id) as id, 'cliente' as tipo,
           coalesce(c.business_name, c.name, 'Azienda') as nome, c.vertical as categoria, c.status as stato, null::text as temperatura,
           null::numeric as fatturato, c.email, c.phone as telefono,
           coalesce(c.operational_city, c.legal_city) as citta,
           coalesce(c.operational_province, c.legal_province) as provincia, c.region as regione, null::text as indirizzo,
           coalesce(c.operational_lat, pc.lat) as lat, coalesce(c.operational_lng, pc.lng) as lng, (c.operational_lat is not null) as precise,
           '{}'::jsonb as attivita
    from public.companies c
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select ('mkt-'||m.id), case when sc2.contact_id is not null then 'cliente' else 'prospect' end,
           coalesce(m.company_name, nullif(trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')),''), 'Contatto'),
           (m.tags)[1], m.stato, m.ai_score_tier,
           m.fatturato, m.email, m.phone, m.city, m.province, m.region, m.address,
           coalesce(m.lat, pc.lat), coalesce(m.lng, pc.lng), (m.lat is not null),
           coalesce((select jsonb_object_agg(x.at, x.c)
                     from (select activity_type as at, count(*) as c
                           from public.marketing_contact_activities a
                           where a.contact_id = m.id group by 1) x), '{}'::jsonb)
    from public.marketing_contacts m
    left join public.crm_province_centroids pc on pc.sigla = upper(m.province)
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  )
  select * from pts p
  where p.lat is not null and p.lng is not null
    and p.lat between p_min_lat and p_max_lat and p.lng between p_min_lng and p_max_lng
  limit p_limit;
end; $$;
grant execute on function public.crm_map_points_bbox(uuid,double precision,double precision,double precision,double precision,int) to authenticated;
