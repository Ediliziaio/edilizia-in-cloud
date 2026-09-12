-- Sales OS per pipeline, come il report Venditori (20280915410007/…008).
--
-- Velocity, forecast, pipeline pesata, opportunità ferme e preventivi
-- mescolavano lavori che non c'entrano l'uno con l'altro: per BeMade
-- «Nuovo» e «Restauro» hanno cicli e tassi diversi, e il numero unico non
-- serviva a nessuno. Vuoto = tutte, come prima.
--
-- I preventivi una pipeline non ce l'hanno: contano quelli dell'opportunità
-- della pipeline, o — se il preventivo non è legato a un'opportunità — del cui
-- contatto c'è un'opportunità lì (la regola degli appuntamenti). L'elenco si
-- legge UNA volta sola (CTE pipe): la stessa ricerca fatta per riga costava
-- trenta secondi su ventimila opportunità.
--
-- Firma nuova = funzione nuova: la vecchia si toglie, il parametro ha un
-- default, e chi chiama senza pipeline continua a funzionare.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── Velocity ────────────────────────────────────────────────────────────────

drop function if exists public.get_sales_velocity(uuid, integer);

create function public.get_sales_velocity(p_company_id uuid, p_days_back integer default 90, p_pipeline_id uuid default null)
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
      from public.vendite_opportunita(p_company_id, v_da, v_a, null, p_pipeline_id) v
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

-- ─── Forecast ────────────────────────────────────────────────────────────────

drop function if exists public.get_sales_forecast(uuid, integer);

create function public.get_sales_forecast(p_company_id uuid, p_months_ahead integer default 3, p_pipeline_id uuid default null)
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
       and (p_pipeline_id is null or mo.pipeline_id = p_pipeline_id)
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

-- ─── Pipeline pesata ─────────────────────────────────────────────────────────

drop function if exists public.get_weighted_pipeline(uuid);

create function public.get_weighted_pipeline(p_company_id uuid, p_pipeline_id uuid default null)
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
      from public.vendite_opportunita(p_company_id, v_oggi, v_oggi, null, p_pipeline_id) v
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
     and (p_pipeline_id is null or p.id = p_pipeline_id)
   order by p.name, s.position;
end;
$function$;

-- ─── Opportunità ferme ───────────────────────────────────────────────────────

drop function if exists public.get_stalled_opportunities(uuid);

create function public.get_stalled_opportunities(p_company_id uuid, p_pipeline_id uuid default null)
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
       and (p_pipeline_id is null or mo.pipeline_id = p_pipeline_id)
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

-- ─── Preventivi ──────────────────────────────────────────────────────────────

drop function if exists public.vendite_preventivi(uuid, date, date, uuid);

create function public.vendite_preventivi(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null,
  p_pipeline uuid default null
)
returns table (
  firmati bigint,
  firmati_valore numeric,
  in_attesa bigint,
  in_attesa_valore numeric,
  rifiutati bigint,
  scaduti bigint,
  tasso_accettazione numeric
)
language sql
stable
as $$
  with pipe as (
    -- le opportunità della pipeline scelta, lette una volta sola
    select po.id, po.contact_id
      from public.marketing_opportunities po
     where p_pipeline is not null
       and po.company_id = p_company
       and po.deleted_at is null
       and po.pipeline_id = p_pipeline
  ), q as (
    select q.status,
           coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0)::numeric as imponibile,
           coalesce(q.signed_at, q.created_at) as firmato_il,
           q.created_at
      from public.quotes q
     where q.company_id = p_company
       and q.deleted_at is null
       and (p_venditore is null or coalesce(q.salesperson_id, q.assigned_to, q.created_by) = p_venditore)
       and (p_pipeline is null
            or q.opportunity_id in (select pipe.id from pipe)
            or (q.opportunity_id is null and q.contact_id in (select pipe.contact_id from pipe)))
  ), r as (
    select q.*,
           q.status in ('accettata', 'convertita') as firmato,
           q.created_at >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.created_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as creato_nel_periodo,
           q.firmato_il >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.firmato_il < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as firmato_nel_periodo
      from q
  )
  select count(*) filter (where firmato and firmato_nel_periodo),
         coalesce(sum(imponibile) filter (where firmato and firmato_nel_periodo), 0),
         -- in attesa di risposta: la situazione di oggi, non del periodo
         count(*) filter (where status = 'inviata'),
         coalesce(sum(imponibile) filter (where status = 'inviata'), 0),
         count(*) filter (where status = 'rifiutata' and creato_nel_periodo),
         count(*) filter (where status = 'scaduta' and creato_nel_periodo),
         -- tra i preventivi del periodo che hanno avuto una risposta
         round(100.0 * count(*) filter (where firmato and creato_nel_periodo)
               / nullif(count(*) filter (where creato_nel_periodo
                                           and (firmato or status in ('rifiutata', 'scaduta'))), 0), 1)
    from r
$$;

-- Le funzioni ricreate ripartono con i privilegi di default: si richiudono ad anon.
revoke all on function public.get_sales_velocity(uuid, integer, uuid) from public, anon;
grant execute on function public.get_sales_velocity(uuid, integer, uuid) to authenticated, service_role;
revoke all on function public.get_sales_forecast(uuid, integer, uuid) from public, anon;
grant execute on function public.get_sales_forecast(uuid, integer, uuid) to authenticated, service_role;
revoke all on function public.get_weighted_pipeline(uuid, uuid) from public, anon;
grant execute on function public.get_weighted_pipeline(uuid, uuid) to authenticated, service_role;
revoke all on function public.get_stalled_opportunities(uuid, uuid) from public, anon;
grant execute on function public.get_stalled_opportunities(uuid, uuid) to authenticated, service_role;
revoke all on function public.vendite_preventivi(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.vendite_preventivi(uuid, date, date, uuid, uuid) to authenticated, service_role;
