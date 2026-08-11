-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Aggiorna la salute DB con la deliverability (MX) + funzione per marcare i non consegnabili.
create or replace function public.crm_cold_db_health(p_company uuid default '00000000-0000-0000-0000-000000000001')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if not public.is_super_admin() then raise exception 'not authorized' using errcode='42501'; end if;
  with c as (
    select *, lower(split_part(email,'@',2)) as dom from marketing_contacts
    where company_id=p_company and source_channel='cold_import' and deleted_at is null
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'con_email', (select count(*) from c where email is not null),
    'con_tel', (select count(*) from c where phone is not null),
    'contattabili', (select count(*) from c where email is not null or phone is not null),
    'con_fatturato', (select count(*) from c where fatturato is not null),
    'con_dipendenti', (select count(*) from c where dipendenti is not null),
    'geo_esatti', (select count(*) from c where lat is not null),
    'geo_totali', (select count(*) from c where province is not null or lat is not null),
    'con_piva', (select count(*) from c where vat_number is not null),
    'optout', (select count(*) from c where unsubscribed or optout_email or opt_out),
    'dup_email', (select coalesce(sum(cnt-1),0)::int from (select lower(email) e, count(*) cnt from c where email is not null group by lower(email) having count(*)>1) d),
    'email_verificate', (select count(*) from c join crm_email_domain_mx mx on mx.domain=c.dom where c.email is not null),
    'email_no_mx', (select count(*) from c join crm_email_domain_mx mx on mx.domain=c.dom where c.email is not null and mx.has_mx=false),
    'tiers', (select coalesce(jsonb_object_agg(coalesce(icp_tier,'?'), n),'{}'::jsonb) from (select icp_tier, count(*) n from c group by icp_tier) t),
    'categorie', (select coalesce(jsonb_agg(jsonb_build_object('k',k,'n',n) order by n desc),'[]'::jsonb)
                  from (select t as k, count(*) n from c, unnest(tags) t
                        where t in ('costruzioni','impianti_ristrutturazione','serramenti','materiali_edili','carpenteria_metallica','schermature') group by t) x),
    'regioni', (select coalesce(jsonb_agg(jsonb_build_object('k',region,'n',n) order by n desc),'[]'::jsonb)
                from (select region, count(*) n from c where region is not null group by region order by count(*) desc limit 8) x)
  ) into res;
  return res;
end $$;

-- Marca (tag 'email-non-consegnabile') i contatti con dominio senza MX; toglie il tag se il dominio ha MX.
create or replace function public.crm_flag_undeliverable_emails(p_company uuid default '00000000-0000-0000-0000-000000000001')
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update marketing_contacts m
     set tags = (select array(select distinct t from unnest(m.tags || array['email-non-consegnabile']) t))
  from crm_email_domain_mx mx
  where m.company_id=p_company and m.source_channel='cold_import' and m.email is not null
    and mx.domain = lower(split_part(m.email,'@',2)) and mx.has_mx = false
    and not (m.tags @> array['email-non-consegnabile']);
  get diagnostics n = row_count;
  return n;
end $$;
