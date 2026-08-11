-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

alter table public.crm_province_centroids add column if not exists regione text;

update public.crm_province_centroids set regione = m.reg from (values
  ('AQ','Abruzzo'),('CH','Abruzzo'),('PE','Abruzzo'),('TE','Abruzzo'),
  ('MT','Basilicata'),('PZ','Basilicata'),
  ('CS','Calabria'),('CZ','Calabria'),('KR','Calabria'),('RC','Calabria'),('VV','Calabria'),
  ('AV','Campania'),('BN','Campania'),('CE','Campania'),('NA','Campania'),('SA','Campania'),
  ('BO','Emilia-Romagna'),('FC','Emilia-Romagna'),('FE','Emilia-Romagna'),('MO','Emilia-Romagna'),
  ('PC','Emilia-Romagna'),('PR','Emilia-Romagna'),('RA','Emilia-Romagna'),('RE','Emilia-Romagna'),('RN','Emilia-Romagna'),
  ('GO','Friuli-Venezia Giulia'),('PN','Friuli-Venezia Giulia'),('TS','Friuli-Venezia Giulia'),('UD','Friuli-Venezia Giulia'),
  ('FR','Lazio'),('LT','Lazio'),('RI','Lazio'),('RM','Lazio'),('VT','Lazio'),
  ('GE','Liguria'),('IM','Liguria'),('SP','Liguria'),('SV','Liguria'),
  ('BG','Lombardia'),('BS','Lombardia'),('CO','Lombardia'),('CR','Lombardia'),('LC','Lombardia'),('LO','Lombardia'),
  ('MB','Lombardia'),('MI','Lombardia'),('MN','Lombardia'),('PV','Lombardia'),('SO','Lombardia'),('VA','Lombardia'),
  ('AN','Marche'),('AP','Marche'),('FM','Marche'),('MC','Marche'),('PU','Marche'),
  ('CB','Molise'),('IS','Molise'),
  ('AL','Piemonte'),('AT','Piemonte'),('BI','Piemonte'),('CN','Piemonte'),('NO','Piemonte'),('TO','Piemonte'),('VB','Piemonte'),('VC','Piemonte'),
  ('BA','Puglia'),('BT','Puglia'),('BR','Puglia'),('FG','Puglia'),('LE','Puglia'),('TA','Puglia'),
  ('CA','Sardegna'),('NU','Sardegna'),('OR','Sardegna'),('SS','Sardegna'),('SU','Sardegna'),
  ('AG','Sicilia'),('CL','Sicilia'),('CT','Sicilia'),('EN','Sicilia'),('ME','Sicilia'),('PA','Sicilia'),('RG','Sicilia'),('SR','Sicilia'),('TP','Sicilia'),
  ('AR','Toscana'),('FI','Toscana'),('GR','Toscana'),('LI','Toscana'),('LU','Toscana'),('MS','Toscana'),('PI','Toscana'),('PO','Toscana'),('PT','Toscana'),('SI','Toscana'),
  ('BZ','Trentino-Alto Adige'),('TN','Trentino-Alto Adige'),
  ('PG','Umbria'),('TR','Umbria'),
  ('AO','Valle d''Aosta'),
  ('BL','Veneto'),('PD','Veneto'),('RO','Veneto'),('TV','Veneto'),('VE','Veneto'),('VI','Veneto'),('VR','Veneto')
) as m(sigla, reg)
where public.crm_province_centroids.sigla = m.sigla;

create or replace function public.crm_map_region_stats(p_company uuid)
returns table (regione text, n bigint, n_clienti bigint, n_prospect bigint)
language plpgsql stable security definer set search_path = public as $$
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
  select coalesce(p.regione, 'Sconosciuta') as regione,
         count(*) as n,
         count(*) filter (where p.is_cliente) as n_clienti,
         count(*) filter (where not p.is_cliente) as n_prospect
  from pts p
  group by 1
  order by n desc;
end; $$;
grant execute on function public.crm_map_region_stats(uuid) to authenticated;
