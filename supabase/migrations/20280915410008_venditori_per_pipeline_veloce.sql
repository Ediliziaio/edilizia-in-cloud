-- Il filtro per pipeline del report Venditori, veloce.
--
-- 20280915410007 chiedeva per ogni appuntamento e per ogni contatto «hai
-- un'opportunità in questa pipeline?» (vendite_in_pipeline): una ricerca per
-- riga con un OR su due colonne, che l'indice non sa servire. Su BeMade
-- (ventimila opportunità) il report di un anno passava da 0,2 a 8 secondi e il
-- controllo del CRM a 30. Qui le opportunità della pipeline si leggono una
-- volta sola (pipe) e appuntamenti e contatti si confrontano con quell'elenco.
-- Stesse firme e stesse regole: cambia solo il modo di contare. Il filtro non
-- era ancora usato dalla pagina.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.get_vendor_kpi_per_agent(
  p_company_id uuid,
  p_data_inizio date,
  p_data_fine date,
  p_agent_id uuid default null,
  p_pipeline_id uuid default null
)
returns table(
  agent_id uuid, nome_agente text, email_agente text,
  opp_totali bigint, opp_vinte bigint, opp_perse bigint, opp_aperte bigint,
  tasso_chiusura numeric, tasso_conversione numeric,
  fatturato_generato numeric, importo_medio_chiusura numeric, pipeline_valore numeric, fatturato_perso numeric,
  appuntamenti_fissati bigint, appuntamenti_effettuati bigint, appuntamenti_no_show bigint,
  tasso_show_up numeric, tasso_app_to_opp numeric, tasso_app_to_close numeric,
  avg_giorni_chiusura numeric, avg_giorni_chiusura_perse numeric, min_giorni_chiusura numeric, max_giorni_chiusura numeric,
  nuovi_contatti bigint
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  with pipe as (
    -- le opportunità della pipeline scelta, lette una volta sola
    select po.id, po.contact_id
      from public.marketing_opportunities po
     where p_pipeline_id is not null
       and po.company_id = p_company_id
       and po.deleted_at is null
       and po.pipeline_id = p_pipeline_id
  ),
  o as (
    select v.venditore,
           count(*) filter (where v.creata) as create_n,
           count(*) filter (where v.creata and v.stato = 'won') as create_vinte,
           count(*) filter (where v.vinta) as vinte,
           count(*) filter (where v.persa) as perse,
           count(*) filter (where v.aperta) as aperte,
           sum(v.valore) filter (where v.vinta) as fatturato,
           avg(v.valore) filter (where v.vinta) as ticket,
           sum(v.valore) filter (where v.aperta) as pipeline,
           sum(v.valore) filter (where v.persa) as perso,
           avg(v.giorni_ciclo) filter (where v.vinta) as ciclo,
           avg(v.giorni_ciclo) filter (where v.persa) as ciclo_perse,
           min(v.giorni_ciclo) filter (where v.vinta) as ciclo_min,
           max(v.giorni_ciclo) filter (where v.vinta) as ciclo_max
      from public.vendite_opportunita(p_company_id, p_data_inizio, p_data_fine, p_agent_id, p_pipeline_id) v
     where v.venditore is not null
     group by v.venditore
  ),
  a as (
    select x.venditore,
           count(*) as fissati,
           count(*) filter (where x.effettuato) as effettuati,
           count(*) filter (where x.no_show) as no_show,
           count(*) filter (where x.effettuato and x.con_opportunita) as con_opp,
           count(*) filter (where x.effettuato and x.con_vendita) as con_vendita
      from public.vendite_appuntamenti(p_company_id, p_data_inizio, p_data_fine, p_agent_id) x
     where x.venditore is not null
       and (p_pipeline_id is null
            or x.opportunity_id in (select pipe.id from pipe)
            or (x.opportunity_id is null and x.contact_id in (select pipe.contact_id from pipe)))
     group by x.venditore
  ),
  c as (
    select mc.assigned_to as venditore, count(*) as nuovi
      from public.marketing_contacts mc
     where mc.company_id = p_company_id
       and mc.deleted_at is null
       and mc.assigned_to is not null
       and (p_agent_id is null or mc.assigned_to = p_agent_id)
       and mc.created_at >= (p_data_inizio::timestamp at time zone 'Europe/Rome')
       and mc.created_at < ((p_data_fine + 1)::timestamp at time zone 'Europe/Rome')
       and (p_pipeline_id is null or mc.id in (select pipe.contact_id from pipe))
     group by mc.assigned_to
  ),
  ag as (
    select o.venditore from o where o.create_n + o.vinte + o.perse + o.aperte > 0
    union
    select a.venditore from a
    union
    select c.venditore from c
  )
  select ag.venditore,
         coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, ag.venditore::text)::text,
         p.email::text,
         coalesce(o.create_n, 0)::bigint,
         coalesce(o.vinte, 0)::bigint,
         coalesce(o.perse, 0)::bigint,
         coalesce(o.aperte, 0)::bigint,
         round(100.0 * o.vinte / nullif(o.vinte + o.perse, 0), 1),
         round(100.0 * o.create_vinte / nullif(o.create_n, 0), 1),
         coalesce(o.fatturato, 0),
         round(coalesce(o.ticket, 0), 2),
         coalesce(o.pipeline, 0),
         coalesce(o.perso, 0),
         coalesce(a.fissati, 0)::bigint,
         coalesce(a.effettuati, 0)::bigint,
         coalesce(a.no_show, 0)::bigint,
         round(100.0 * a.effettuati / nullif(a.effettuati + a.no_show, 0), 1),
         round(100.0 * a.con_opp / nullif(a.effettuati, 0), 1),
         round(100.0 * a.con_vendita / nullif(a.effettuati, 0), 1),
         coalesce(round(o.ciclo, 1), 0),
         coalesce(round(o.ciclo_perse, 1), 0),
         coalesce(o.ciclo_min, 0),
         coalesce(o.ciclo_max, 0),
         coalesce(c.nuovi, 0)::bigint
    from ag
    left join public.profiles p on p.id = ag.venditore
    left join o on o.venditore = ag.venditore
    left join a on a.venditore = ag.venditore
    left join c on c.venditore = ag.venditore
   order by coalesce(o.fatturato, 0) desc, 2;
end;
$function$;

create or replace function public.get_vendor_trend_mensile(
  p_company_id uuid,
  p_anno integer default null,
  p_agent_id uuid default null,
  p_pipeline_id uuid default null
)
returns table(
  mese integer, mese_label text,
  opp_vinte bigint, opp_perse bigint, fatturato numeric,
  appuntamenti_fissati bigint, appuntamenti_effettuati bigint,
  tasso_chiusura numeric, tasso_show_up numeric, nuovi_contatti bigint
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_anno integer := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::integer);
  v_da date := make_date(v_anno, 1, 1);
  v_a date := make_date(v_anno, 12, 31);
begin
  perform public.assert_company_access(p_company_id);
  return query
  with pipe as (
    -- le opportunità della pipeline scelta, lette una volta sola
    select po.id, po.contact_id
      from public.marketing_opportunities po
     where p_pipeline_id is not null
       and po.company_id = p_company_id
       and po.deleted_at is null
       and po.pipeline_id = p_pipeline_id
  ),
  chiuse as (
    select extract(month from (coalesce(v.vinta_il, v.persa_il) at time zone 'Europe/Rome'))::integer as m,
           v.vinta, v.persa, v.valore
      from public.vendite_opportunita(p_company_id, v_da, v_a, p_agent_id, p_pipeline_id) v
     where v.venditore is not null
       and (v.vinta or v.persa)
  ),
  om as (
    select ch.m,
           count(*) filter (where ch.vinta) as vinte,
           count(*) filter (where ch.persa) as perse,
           sum(ch.valore) filter (where ch.vinta) as fatt
      from chiuse ch
     group by ch.m
  ),
  am as (
    select extract(month from x.data)::integer as m,
           count(*) as fissati,
           count(*) filter (where x.effettuato) as effettuati,
           count(*) filter (where x.no_show) as no_show
      from public.vendite_appuntamenti(p_company_id, v_da, v_a, p_agent_id) x
     where x.venditore is not null
       and (p_pipeline_id is null
            or x.opportunity_id in (select pipe.id from pipe)
            or (x.opportunity_id is null and x.contact_id in (select pipe.contact_id from pipe)))
     group by 1
  ),
  cm as (
    select extract(month from (mc.created_at at time zone 'Europe/Rome'))::integer as m,
           count(*) as nuovi
      from public.marketing_contacts mc
     where mc.company_id = p_company_id
       and mc.deleted_at is null
       and mc.assigned_to is not null
       and (p_agent_id is null or mc.assigned_to = p_agent_id)
       and mc.created_at >= (v_da::timestamp at time zone 'Europe/Rome')
       and mc.created_at < ((v_a + 1)::timestamp at time zone 'Europe/Rome')
       and (p_pipeline_id is null or mc.id in (select pipe.contact_id from pipe))
     group by 1
  )
  select g.m::integer,
         (array['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'])[g.m]::text,
         coalesce(om.vinte, 0)::bigint,
         coalesce(om.perse, 0)::bigint,
         coalesce(om.fatt, 0),
         coalesce(am.fissati, 0)::bigint,
         coalesce(am.effettuati, 0)::bigint,
         round(100.0 * om.vinte / nullif(om.vinte + om.perse, 0), 1),
         round(100.0 * am.effettuati / nullif(am.effettuati + am.no_show, 0), 1),
         coalesce(cm.nuovi, 0)::bigint
    from generate_series(1, 12) as g(m)
    left join om on om.m = g.m
    left join am on am.m = g.m
    left join cm on cm.m = g.m
   order by g.m;
end;
$function$;

create or replace function public.vendite_controllo_crm(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null,
  p_pipeline uuid default null
)
returns table (
  contatti_senza_venditore bigint,
  opportunita_senza_venditore bigint,
  appuntamenti_senza_venditore bigint,
  appuntamenti_senza_contatto bigint,
  appuntamenti_senza_esito bigint,
  opportunita_senza_prossimo_passo bigint
)
language plpgsql
stable
security invoker
as $$
declare
  v_inizio timestamptz := p_da::timestamp at time zone 'Europe/Rome';
  v_fine timestamptz := (p_a + 1)::timestamp at time zone 'Europe/Rome';
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  perform public.assert_company_access(p_company);

  return query
  with pipe as (
    -- le opportunità della pipeline scelta, lette una volta sola
    select po.id, po.contact_id
      from public.marketing_opportunities po
     where p_pipeline is not null
       and po.company_id = p_company
       and po.deleted_at is null
       and po.pipeline_id = p_pipeline
  )
  select
    -- contatti arrivati nel periodo senza nessuno che li segua (solo per il team)
    case when p_venditore is null then (
      select count(*)
        from public.marketing_contacts c
       where c.company_id = p_company
         and c.deleted_at is null
         and c.assigned_to is null
         and c.created_at >= v_inizio and c.created_at < v_fine
         and (p_pipeline is null or c.id in (select pipe.contact_id from pipe))
    ) else 0 end::bigint,
    case when p_venditore is null then (
      select count(*)
        from public.vendite_opportunita(p_company, p_da, p_a, null, p_pipeline) vo
       where vo.creata and vo.venditore is null
    ) else 0 end::bigint,
    case when p_venditore is null then ap.senza_venditore else 0 end::bigint,
    ap.senza_contatto::bigint,
    ap.senza_esito::bigint,
    (
      select count(*)
        from public.marketing_opportunities mo
       where mo.company_id = p_company
         and mo.deleted_at is null
         and mo.status = 'open'
         and mo.created_at < v_fine
         and (p_venditore is null or mo.assigned_to = p_venditore)
         and (p_pipeline is null or mo.pipeline_id = p_pipeline)
         and (
           -- nessun prossimo passo: né un'azione scritta né una data da oggi in poi
           (nullif(btrim(mo.next_action), '') is null
             and (mo.next_action_date is null or mo.next_action_date < v_oggi))
           -- oppure niente di nuovo da due settimane (stesso «ultimo contatto»
           -- delle opportunità ferme)
           or greatest(
                (select max(mca.created_at)
                   from public.marketing_contact_activities mca
                  where mca.company_id = mo.company_id and mca.contact_id = mo.contact_id),
                mo.last_activity_at, mo.stage_changed_at, mo.created_at
              ) < now() - interval '14 days'
         )
    )::bigint
  from (
    select count(*) filter (where va.venditore is null) as senza_venditore,
           count(*) filter (where va.contact_id is null
                              and (p_venditore is null or va.venditore = p_venditore)) as senza_contatto,
           count(*) filter (where va.senza_esito
                              and (p_venditore is null or va.venditore = p_venditore)) as senza_esito
      from public.vendite_appuntamenti(p_company, p_da, p_a, null) va
     where p_pipeline is null
        or va.opportunity_id in (select pipe.id from pipe)
        or (va.opportunity_id is null and va.contact_id in (select pipe.contact_id from pipe))
  ) ap;
end;
$$;

drop function if exists public.vendite_in_pipeline(uuid, uuid, uuid, uuid);
