-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create table if not exists public.crm_province_centroids (
  sigla text primary key,
  lat double precision not null,
  lng double precision not null
);

insert into public.crm_province_centroids (sigla, lat, lng) values
('AG',37.31,13.58),('AL',44.91,8.62),('AN',43.62,13.51),('AO',45.74,7.32),('AR',43.46,11.88),('AP',42.85,13.58),('AT',44.90,8.21),('AV',40.91,14.79),('BA',41.12,16.87),('BT',41.20,16.28),('BL',46.14,12.22),('BN',41.13,14.78),('BG',45.70,9.67),('BI',45.57,8.05),('BO',44.49,11.34),('BZ',46.50,11.35),('BS',45.54,10.22),('BR',40.63,17.94),('CA',39.22,9.12),('CL',37.49,14.06),('CB',41.56,14.66),('CE',41.07,14.33),('CT',37.51,15.08),('CZ',38.91,16.59),('CH',42.35,14.17),('CO',45.81,9.08),('CS',39.30,16.25),('CR',45.13,10.02),('KR',39.08,17.12),('CN',44.39,7.55),('EN',37.57,14.28),('FM',43.16,13.72),('FE',44.84,11.62),('FI',43.77,11.26),('FG',41.46,15.55),('FC',44.22,12.04),('FR',41.64,13.35),('GE',44.41,8.93),('GO',45.94,13.62),('GR',42.76,11.11),('IM',43.89,8.03),('IS',41.60,14.23),('AQ',42.35,13.40),('SP',44.11,9.83),('LT',41.47,12.90),('LE',40.35,18.17),('LC',45.86,9.39),('LI',43.55,10.31),('LO',45.31,9.50),('LU',43.84,10.50),('MC',43.30,13.45),('MN',45.16,10.79),('MS',44.04,10.14),('MT',40.67,16.60),('ME',38.19,15.55),('MI',45.46,9.19),('MO',44.65,10.93),('MB',45.58,9.27),('NA',40.85,14.27),('NO',45.45,8.62),('NU',40.32,9.33),('OR',39.90,8.59),('PD',45.41,11.88),('PA',38.12,13.36),('PR',44.80,10.33),('PV',45.19,9.16),('PG',43.11,12.39),('PU',43.91,12.90),('PE',42.46,14.22),('PC',45.05,9.69),('PI',43.72,10.40),('PT',43.93,10.92),('PN',45.96,12.66),('PZ',40.64,15.81),('PO',43.88,11.10),('RG',36.93,14.72),('RA',44.42,12.20),('RC',38.11,15.65),('RE',44.70,10.63),('RI',42.40,12.86),('RN',44.06,12.57),('RM',41.90,12.50),('RO',45.07,11.79),('SA',40.68,14.77),('SS',40.73,8.56),('SV',44.31,8.48),('SI',43.32,11.33),('SR',37.07,15.29),('SO',46.17,9.87),('SU',39.28,8.53),('TA',40.46,17.24),('TE',42.66,13.70),('TR',42.56,12.65),('TO',45.07,7.69),('TP',38.02,12.51),('TN',46.07,11.12),('TV',45.67,12.24),('TS',45.65,13.78),('UD',46.06,13.24),('VA',45.82,8.83),('VE',45.44,12.32),('VB',45.92,8.55),('VC',45.32,8.42),('VR',45.44,10.99),('VV',38.68,16.10),('VI',45.55,11.55),('VT',42.42,12.10)
on conflict (sigla) do update set lat = excluded.lat, lng = excluded.lng;

alter table public.crm_province_centroids enable row level security;
drop policy if exists cpc_read ON public.crm_province_centroids;
create policy cpc_read on public.crm_province_centroids for select to authenticated using (true);

create index if not exists idx_mktc_geo on public.marketing_contacts (lat, lng);
create index if not exists idx_mktc_company_province on public.marketing_contacts (company_id, province);
create index if not exists idx_companies_op_geo on public.companies (operational_lat, operational_lng);

create or replace function public.crm_map_cells(
  p_company uuid,
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_prec int
) returns table (gx double precision, gy double precision, n bigint, n_clienti bigint, n_prospect bigint, clat double precision, clng double precision)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  pts as (
    select coalesce(c.operational_lat, pc.lat) as lat, coalesce(c.operational_lng, pc.lng) as lng, true as is_cliente
    from public.companies c
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select coalesce(m.lat, pc.lat), coalesce(m.lng, pc.lng), (sc2.contact_id is not null)
    from public.marketing_contacts m
    left join public.crm_province_centroids pc on pc.sigla = upper(m.province)
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  )
  select round(lng::numeric, p_prec)::double precision, round(lat::numeric, p_prec)::double precision,
         count(*), count(*) filter (where is_cliente), count(*) filter (where not is_cliente),
         avg(lat), avg(lng)
  from pts
  where lat is not null and lng is not null
    and lat between p_min_lat and p_max_lat and lng between p_min_lng and p_max_lng
  group by 1, 2;
end; $$;
grant execute on function public.crm_map_cells(uuid,double precision,double precision,double precision,double precision,int) to authenticated;

create or replace function public.crm_map_points_bbox(
  p_company uuid,
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 2000
) returns table (
  id text, tipo text, nome text, categoria text, stato text, temperatura text,
  fatturato numeric, email text, telefono text, citta text, provincia text, regione text, indirizzo text,
  lat double precision, lng double precision, precise boolean
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
           coalesce(c.operational_lat, pc.lat) as lat, coalesce(c.operational_lng, pc.lng) as lng, (c.operational_lat is not null) as precise
    from public.companies c
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select ('mkt-'||m.id), case when sc2.contact_id is not null then 'cliente' else 'prospect' end,
           coalesce(m.company_name, nullif(trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')),''), 'Contatto'),
           (m.tags)[1], m.stato, m.ai_score_tier,
           m.fatturato, m.email, m.phone, m.city, m.province, m.region, m.address,
           coalesce(m.lat, pc.lat), coalesce(m.lng, pc.lng), (m.lat is not null)
    from public.marketing_contacts m
    left join public.crm_province_centroids pc on pc.sigla = upper(m.province)
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  )
  select * from pts
  where lat is not null and lng is not null
    and lat between p_min_lat and p_max_lat and lng between p_min_lng and p_max_lng
  limit p_limit;
end; $$;
grant execute on function public.crm_map_points_bbox(uuid,double precision,double precision,double precision,double precision,int) to authenticated;
