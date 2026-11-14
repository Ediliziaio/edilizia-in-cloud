-- Sales OS: numeri corretti (14/11/2026), dopo la verifica su Demo Azienda 2.
--
-- 1. vendite_preventivi riconosce anche gli stati al maschile che scrivono i
--    preventivatori di settore (inviato, visto, accettato, rifiutato, scaduto):
--    prima «Preventivi aperti» diceva 0 con due preventivi inviati, e il
--    firmato perdeva gli «accettato».
-- 2. vendite_opportunita e get_sales_forecast: la probabilità ferma al 50%
--    predefinito (il DEFAULT della colonna, 64 trattative su 72 su Demo 2) prende
--    quella della fase (win_probability). Prima «Nuovo lead» pesava 50% invece
--    di 10% e la pipeline pesata era 615.067 € invece di 377.412 €.
-- 3. get_sales_velocity: il ticket medio senza vinte è vuoto, non 0 €.

create or replace function public.vendite_preventivi(p_company uuid, p_da date, p_a date, p_venditore uuid default null::uuid, p_pipeline uuid default null::uuid)
 returns table(firmati bigint, firmati_valore numeric, in_attesa bigint, in_attesa_valore numeric, rifiutati bigint, scaduti bigint, tasso_accettazione numeric)
 language sql
 stable
as $function$
  with pipe as (
    select po.id, po.contact_id
      from public.marketing_opportunities po
     where p_pipeline is not null
       and po.company_id = p_company
       and po.deleted_at is null
       and po.pipeline_id = p_pipeline
  ), q as (
    select case
             when q.status in ('accettata', 'accettato', 'convertita', 'convertito', 'firmata', 'firmato') then 'firmato'
             when q.status in ('inviata', 'inviato', 'vista', 'visto', 'da_consegnare', 'consegnato', 'consegnata', 'in_valutazione') then 'attesa'
             when q.status in ('rifiutata', 'rifiutato') then 'rifiutato'
             when q.status in ('scaduta', 'scaduto') then 'scaduto'
             else q.status
           end as stato,
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
           q.stato = 'firmato' as firmato,
           q.created_at >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.created_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as creato_nel_periodo,
           q.firmato_il >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.firmato_il < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as firmato_nel_periodo
      from q
  )
  select count(*) filter (where firmato and firmato_nel_periodo),
         coalesce(sum(imponibile) filter (where firmato and firmato_nel_periodo), 0),
         count(*) filter (where stato = 'attesa'),
         coalesce(sum(imponibile) filter (where stato = 'attesa'), 0),
         count(*) filter (where stato = 'rifiutato' and creato_nel_periodo),
         count(*) filter (where stato = 'scaduto' and creato_nel_periodo),
         round(100.0 * count(*) filter (where firmato and creato_nel_periodo)
               / nullif(count(*) filter (where creato_nel_periodo
                                           and (firmato or stato in ('rifiutato', 'scaduto'))), 0), 1)
    from r
$function$;

create or replace function public.vendite_opportunita(p_company uuid, p_da date, p_a date, p_venditore uuid default null::uuid, p_pipeline uuid default null::uuid)
 returns table(id uuid, venditore uuid, pipeline_id uuid, stage_id uuid, contact_id uuid, stato text, valore numeric, probabilita numeric, creata boolean, vinta boolean, persa boolean, aperta boolean, scartata boolean, creata_il timestamp with time zone, vinta_il timestamp with time zone, persa_il timestamp with time zone, giorni_ciclo numeric)
 language sql
 stable
as $function$
  select o.id,
         o.assigned_to,
         o.pipeline_id,
         o.stage_id,
         o.contact_id,
         o.status,
         coalesce(o.value, 0)::numeric,
         -- il 50% è il DEFAULT della colonna: se la fase ha una probabilità, vale quella
         greatest(0, least(100,
           case when (o.probability is null or o.probability = 50) and s.win_probability is not null
                then s.win_probability
                else coalesce(o.probability, 50) end))::numeric,
         coalesce(o.created_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.created_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'won'
              and o.won_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.won_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'lost'
              and o.lost_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.lost_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'open', false),
         coalesce(o.status = 'abandoned', false),
         o.created_at,
         case when o.status = 'won' then o.won_at end,
         case when o.status = 'lost' then o.lost_at end,
         case
           when o.status = 'won'  then round((extract(epoch from (o.won_at  - o.created_at)) / 86400.0)::numeric, 1)
           when o.status = 'lost' then round((extract(epoch from (o.lost_at - o.created_at)) / 86400.0)::numeric, 1)
         end
    from public.marketing_opportunities o
    left join public.marketing_pipeline_stages s on s.id = o.stage_id
   where o.company_id = p_company
     and o.deleted_at is null
     and (p_venditore is null or o.assigned_to = p_venditore)
     and (p_pipeline is null or o.pipeline_id = p_pipeline)
$function$;

create or replace function public.get_sales_forecast(p_company_id uuid, p_months_ahead integer default 3, p_pipeline_id uuid default null::uuid)
 returns table(forecast_month date, expected_revenue numeric, weighted_revenue numeric, opportunity_count bigint)
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_mese date := date_trunc('month', (now() at time zone 'Europe/Rome'))::date;
  v_mesi integer := greatest(coalesce(p_months_ahead, 3), 1);
begin
  perform public.assert_company_access(p_company_id);
  return query
  with o as (
    -- stessa probabilità di vendite_opportunita (fase se è rimasto il 50% predefinito)
    select greatest(date_trunc('month', mo.expected_close_date)::date, v_mese) as mese,
           coalesce(mo.value, 0)::numeric as valore,
           greatest(0, least(100,
             case when (mo.probability is null or mo.probability = 50) and s.win_probability is not null
                  then s.win_probability
                  else coalesce(mo.probability, 50) end))::numeric as probabilita
      from public.marketing_opportunities mo
      left join public.marketing_pipeline_stages s on s.id = mo.stage_id
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

create or replace function public.get_sales_velocity(p_company_id uuid, p_days_back integer default 90, p_pipeline_id uuid default null::uuid)
 returns table(open_opportunities bigint, win_rate numeric, avg_deal_size numeric, avg_cycle_days numeric, sales_velocity numeric)
 language plpgsql
 stable
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
         round(o.ticket, 2),
         round(o.ciclo, 1),
         case when o.ciclo > 0 and o.vinte + o.perse > 0
              then round(o.valore_aperto * o.vinte / (o.vinte + o.perse) / o.ciclo, 2)
         end
    from o;
end;
$function$;
