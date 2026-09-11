-- Sales OS sulla definizione unica (20280915410001).
--
-- Stesse firme e stesse colonne: la pagina non cambia, cambiano i numeri.
--
-- get_sales_velocity. La formula era: opportunità aperte (TUTTE, di sempre) ×
-- tasso di vittoria del periodo × ticket medio ÷ ciclo. Con migliaia di lead
-- ancora senza valore diceva a BeMade 312.652 € al giorno. Ora parte dal
-- VALORE della pipeline aperta: valore aperto × tasso di chiusura ÷ ciclo
-- medio. Vinte e perse per won_at/lost_at (prima updated_at), le scartate non
-- sono perse (prima sì), e senza vinte nel periodo ciclo e velocità restano
-- vuoti invece di un «30 giorni» inventato.
--
-- get_sales_forecast. Una chiusura prevista già passata non sparisce più:
-- conta nel mese corrente. Mesi senza opportunità presenti con zero, così il
-- grafico copre sempre tutto l'orizzonte. Probabilità come nel resto (50% se
-- manca, non più una scala inventata sulla posizione della fase).
--
-- get_weighted_pipeline. Stessa probabilità, cancellate escluse.
--
-- get_stalled_opportunities. L'ultima attività è la PIÙ RECENTE tra quelle note
-- (prima vinceva la prima non vuota: un'attività vecchia sul contatto copriva un
-- last_activity_at recente), l'updated_at non conta più (un'operazione di massa
-- faceva sembrare vive le ferme), cancellate escluse.
--
-- Tutte SECURITY INVOKER (prima DEFINER): chi vede solo i propri lead riceve
-- solo le proprie opportunità ferme. Prima a un venditore di BeMade arrivavano
-- 764 righe, 762 di colleghi, nascoste solo a schermo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.get_sales_velocity(p_company_id uuid, p_days_back integer default 90)
returns table(open_opportunities bigint, win_rate numeric, avg_deal_size numeric, avg_cycle_days numeric, sales_velocity numeric)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_a date := (now() at time zone 'Europe/Rome')::date;
  v_da date := (now() at time zone 'Europe/Rome')::date - greatest(coalesce(p_days_back, 90), 1) + 1;
begin
  perform public.assert_company_access(p_company_id);
  return query
  with o as (
    select count(*) filter (where v.aperta) as aperte,
           coalesce(sum(v.valore) filter (where v.aperta), 0) as valore_aperto,
           count(*) filter (where v.vinta) as vinte,
           count(*) filter (where v.persa) as perse,
           avg(v.valore) filter (where v.vinta) as ticket,
           avg(v.giorni_ciclo) filter (where v.vinta) as ciclo
      from public.vendite_opportunita(p_company_id, v_da, v_a) v
  )
  select o.aperte::bigint,
         round(100.0 * o.vinte / nullif(o.vinte + o.perse, 0), 1),
         round(coalesce(o.ticket, 0), 2),
         round(o.ciclo, 1),
         case when o.ciclo > 0 and o.vinte + o.perse > 0
              then round(o.valore_aperto * o.vinte / (o.vinte + o.perse) / o.ciclo, 2)
         end
    from o;
end;
$function$;

create or replace function public.get_sales_forecast(p_company_id uuid, p_months_ahead integer default 3)
returns table(forecast_month date, expected_revenue numeric, weighted_revenue numeric, opportunity_count bigint)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_mese date := date_trunc('month', (now() at time zone 'Europe/Rome'))::date;
  v_mesi integer := greatest(coalesce(p_months_ahead, 3), 1);
begin
  perform public.assert_company_access(p_company_id);
  return query
  with o as (
    -- stesse regole di vendite_opportunita: aperta, non cancellata, 50% se manca
    select greatest(date_trunc('month', mo.expected_close_date)::date, v_mese) as mese,
           coalesce(mo.value, 0)::numeric as valore,
           greatest(0, least(100, coalesce(mo.probability, 50)))::numeric as probabilita
      from public.marketing_opportunities mo
     where mo.company_id = p_company_id
       and mo.deleted_at is null
       and mo.status = 'open'
       and mo.expected_close_date is not null
       and mo.expected_close_date < (v_mese + make_interval(months => v_mesi))::date
  )
  select g.mese::date,
         coalesce(sum(o.valore), 0),
         coalesce(round(sum(o.valore * o.probabilita / 100.0), 2), 0),
         count(o.valore)::bigint
    from generate_series(v_mese, (v_mese + make_interval(months => v_mesi - 1))::date, interval '1 month') as g(mese)
    left join o on o.mese = g.mese::date
   group by g.mese
   order by g.mese;
end;
$function$;

create or replace function public.get_weighted_pipeline(p_company_id uuid)
returns table(pipeline_id uuid, pipeline_name text, stage_id uuid, stage_name text, stage_position integer,
              opportunity_count bigint, total_value numeric, weighted_value numeric, avg_probability integer)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  perform public.assert_company_access(p_company_id);
  return query
  with o as (
    select v.stage_id as fase,
           count(*) as n,
           sum(v.valore) as valore,
           sum(v.valore * v.probabilita / 100.0) as pesato,
           avg(v.probabilita) as prob
      from public.vendite_opportunita(p_company_id, v_oggi, v_oggi) v
     where v.aperta
     group by v.stage_id
  )
  select p.id, p.name::text, s.id, s.name::text, s.position,
         coalesce(o.n, 0)::bigint,
         coalesce(o.valore, 0),
         coalesce(round(o.pesato, 2), 0),
         round(o.prob)::integer
    from public.marketing_pipelines p
    join public.marketing_pipeline_stages s on s.pipeline_id = p.id
    left join o on o.fase = s.id
   where p.company_id = p_company_id
   order by p.name, s.position;
end;
$function$;

create or replace function public.get_stalled_opportunities(p_company_id uuid)
returns table(opportunity_id uuid, opportunity_name text, contact_name text, stage_name text, assigned_to uuid,
              last_activity_at timestamptz, days_stalled integer, stalled_threshold integer, value numeric)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  with att as (
    select mo.id as opp,
           greatest(max(mca.created_at), mo.last_activity_at, mo.stage_changed_at, mo.created_at) as ultima
      from public.marketing_opportunities mo
      left join public.marketing_contact_activities mca
        on mca.company_id = mo.company_id and mca.contact_id = mo.contact_id
     where mo.company_id = p_company_id
       and mo.status = 'open'
       and mo.deleted_at is null
     group by mo.id
  )
  select mo.id,
         mo.name::text,
         btrim(concat_ws(' ', mc.first_name, mc.last_name))::text,
         s.name::text,
         mo.assigned_to,
         att.ultima,
         floor(extract(epoch from (now() - att.ultima)) / 86400)::integer,
         coalesce(s.stalled_threshold_days, 14)::integer,
         mo.value
    from att
    join public.marketing_opportunities mo on mo.id = att.opp
    join public.marketing_pipeline_stages s on s.id = mo.stage_id
    left join public.marketing_contacts mc on mc.id = mo.contact_id
   where floor(extract(epoch from (now() - att.ultima)) / 86400) >= coalesce(s.stalled_threshold_days, 14)
   order by 7 desc;
end;
$function$;
