-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- POINTS: precise -> CAP (comune) -> provincia, con jitter RADIALE (disco) scalato per livello
CREATE OR REPLACE FUNCTION public.crm_map_points_bbox(p_company uuid, p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer DEFAULT 2000)
 RETURNS TABLE(id text, tipo text, nome text, categoria text, stato text, temperatura text, fatturato numeric, email text, telefono text, citta text, provincia text, regione text, indirizzo text, lat double precision, lng double precision, precise boolean, attivita jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  base as (
    select ('comp-'||c.id) as id, 'cliente' as tipo,
           coalesce(c.business_name, c.name, 'Azienda') as nome, c.vertical as categoria, c.status as stato, null::text as temperatura,
           null::numeric as fatturato, c.email, c.phone as telefono,
           coalesce(c.operational_city, c.legal_city) as citta,
           coalesce(c.operational_province, c.legal_province) as provincia, c.region as regione, null::text as indirizzo,
           coalesce(c.operational_lat, cc.lat, pc.lat) as blat,
           coalesce(c.operational_lng, cc.lng, pc.lng) as blng,
           (c.operational_lat is not null) as precise,
           (c.operational_lat is null and cc.lat is not null) as cap_level,
           '{}'::jsonb as attivita
    from public.companies c
    left join public.crm_cap_centroids cc on cc.cap = coalesce(c.operational_postal_code, c.legal_postal_code)
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select ('mkt-'||m.id), case when sc2.contact_id is not null then 'cliente' else 'prospect' end,
           coalesce(m.company_name, nullif(trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')),''), 'Contatto'),
           (m.tags)[1], m.stato, m.ai_score_tier,
           m.fatturato, m.email, m.phone, m.city, m.province, m.region, m.address,
           coalesce(m.lat, cc.lat, pc.lat), coalesce(m.lng, cc.lng, pc.lng),
           (m.lat is not null), (m.lat is null and cc.lat is not null),
           coalesce((select jsonb_object_agg(x.at, x.c)
                     from (select activity_type as at, count(*) as c
                           from public.marketing_contact_activities a
                           where a.contact_id = m.id group by 1) x), '{}'::jsonb)
    from public.marketing_contacts m
    left join public.crm_cap_centroids cc on cc.cap = m.postal_code
    left join public.crm_province_centroids pc on pc.sigla = upper(m.province)
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  ),
  j as (
    select b.*,
      case when b.precise then 0.0 when b.cap_level then 0.012 else 0.045 end as r_max,
      (((hashtext(b.id) % 10000) + 10000) % 10000) / 10000.0 as h_ang,
      (((hashtext(b.id||'r') % 10000) + 10000) % 10000) / 10000.0 as h_rad
    from base b
    where b.blat is not null and b.blng is not null
  ),
  jj as (
    select id, tipo, nome, categoria, stato, temperatura, fatturato, email, telefono, citta, provincia, regione, indirizzo, precise, attivita,
      blat + sqrt(h_rad) * r_max * cos(2*pi()*h_ang) as lat,
      blng + sqrt(h_rad) * r_max * sin(2*pi()*h_ang) / greatest(cos(radians(blat)), 0.3) as lng
    from j
  )
  select id, tipo, nome, categoria, stato, temperatura, fatturato, email, telefono, citta, provincia, regione, indirizzo, lat, lng, precise, attivita
  from jj
  where lat between p_min_lat and p_max_lat and lng between p_min_lng and p_max_lng
  limit p_limit;
end; $function$;

-- CELLS: stessa priorità coord (CAP->provincia), nessun jitter (aggrega)
CREATE OR REPLACE FUNCTION public.crm_map_cells(p_company uuid, p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_prec integer)
 RETURNS TABLE(gx double precision, gy double precision, n bigint, n_clienti bigint, n_prospect bigint, clat double precision, clng double precision)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  pts as (
    select coalesce(c.operational_lat, cc.lat, pc.lat) as lat, coalesce(c.operational_lng, cc.lng, pc.lng) as lng, true as is_cliente
    from public.companies c
    left join public.crm_cap_centroids cc on cc.cap = coalesce(c.operational_postal_code, c.legal_postal_code)
    left join public.crm_province_centroids pc on pc.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select coalesce(m.lat, cc.lat, pc.lat), coalesce(m.lng, cc.lng, pc.lng), (sc2.contact_id is not null)
    from public.marketing_contacts m
    left join public.crm_cap_centroids cc on cc.cap = m.postal_code
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
end; $function$;

-- REGION STATS: esclude gli irrecuperabili (nessuna regione derivabile) dal pannello "dove concentrare l'outreach"
CREATE OR REPLACE FUNCTION public.crm_map_region_stats(p_company uuid)
 RETURNS TABLE(regione text, n bigint, n_clienti bigint, n_prospect bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  with sc as (select distinct contact_id from public.aedix_service_clients where contact_id is not null),
  pts as (
    select coalesce(nullif(trim(c.region), ''), pcr.regione) as regione, true as is_cliente
    from public.companies c
    left join public.crm_province_centroids pcr on pcr.sigla = upper(coalesce(c.operational_province, c.legal_province))
    where c.is_platform_admin_company is not true
    union all
    select coalesce(nullif(trim(m.region), ''), pcr.regione), (sc2.contact_id is not null)
    from public.marketing_contacts m
    left join public.crm_province_centroids pcr on pcr.sigla = upper(m.province)
    left join sc sc2 on sc2.contact_id = m.id
    where m.company_id = p_company
  )
  select p.regione, count(*) as n,
         count(*) filter (where p.is_cliente) as n_clienti,
         count(*) filter (where not p.is_cliente) as n_prospect
  from pts p
  where p.regione is not null and trim(p.regione) <> ''
  group by 1
  order by n desc;
end; $function$;
