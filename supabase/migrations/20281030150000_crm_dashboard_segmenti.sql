-- Ricostruito il 30/10/2026 dal SQL registrato in schema_migrations: la
-- migrazione era stata applicata in produzione senza il suo file, e il
-- controllo Supabase Preview si fermava. Testo identico a quello applicato.

create or replace function public.crm_dashboard_segmenti(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with c as (
    select id,
           nullif(trim(company_name), '') as azienda,
           nullif(trim(source), '') as fonte,
           nullif(trim(tipo), '') as mestiere,
           nullif(trim(province), '') as zona,
           nullif(trim(ateco_code), '') as ateco,
           nullif(trim(company_size), '') as dimensione,
           coalesce(ai_predicted_value_eur, 0) as valore,
           coalesce(is_decision_maker, false) as dm,
           trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) as nome,
           coalesce(ai_score_tier, '') ~* '(hot|cald|high|alto|^a$)' as caldo,
           last_activity_at
      from public.marketing_contacts
     where company_id = p_company
       and deleted_at is null   -- i contatti eliminati non contano, come nell'elenco Contatti
  ),
  pipe as (
    select contact_id, sum(coalesce(value, 0)) as pipeline
      from public.marketing_opportunities
     where company_id = p_company and deleted_at is null and status = 'open' and contact_id is not null
     group by contact_id
  ),
  az as (
    select c.azienda,
           count(*) as contatti,
           coalesce(sum(p.pipeline), 0) as pipeline,
           count(*) filter (where c.caldo) as caldi,
           min(c.mestiere) as mestiere,
           min(c.nome) filter (where c.dm) as decision_maker,
           bool_or(c.dm) as ha_dm
      from c left join pipe p on p.contact_id = c.id
     where c.azienda is not null
     group by c.azienda
  )
  select jsonb_build_object(
    'fonti', coalesce((select jsonb_agg(x order by x.n desc) from (
        select coalesce(fonte, '—') as fonte, count(*) as n from c group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'mestieri', coalesce((select jsonb_agg(x order by x.n desc) from (
        select mestiere, count(*) as n, sum(valore) as valore from c where mestiere is not null group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'zone', coalesce((select jsonb_agg(x order by x.n desc) from (
        select zona, count(*) as n from c where zona is not null group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'ateco', coalesce((select jsonb_agg(x order by x.n desc) from (
        select ateco, count(*) as n from c where ateco is not null group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'dimensioni', coalesce((select jsonb_agg(x order by x.n desc) from (
        select dimensione, count(*) as n from c where dimensione is not null group by 1 order by 2 desc limit 6) x), '[]'::jsonb),
    'aziende', coalesce((select jsonb_agg(x order by x.pipeline desc, x.contatti desc) from (
        select azienda, contatti, pipeline, caldi, mestiere, decision_maker
          from az order by pipeline desc, contatti desc limit 8) x), '[]'::jsonb),
    'caldi_senza_followup', (select count(*) from c
        where caldo and (last_activity_at is null or last_activity_at < now() - interval '5 days')),
    'aziende_calde_senza_dm', (select count(*) from az where caldi > 0 and not ha_dm)
  ) into v;

  return v;
end;
$function$;

revoke all on function public.crm_dashboard_segmenti(uuid) from public, anon;
grant execute on function public.crm_dashboard_segmenti(uuid) to authenticated;
