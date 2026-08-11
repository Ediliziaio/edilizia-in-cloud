-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Trend 12 mesi aggregati SERVER-SIDE (cruscotto + marketing).
-- Prima: il client scaricava le righe grezze e sommava in JS; il cap righe
-- PostgREST (~1000) troncava silenziosamente i totali su aziende grandi.
-- SECURITY INVOKER: RLS si applica normalmente. Bucket in Europe/Rome per
-- parità col vecchio client (getMonth() nel fuso del browser).

create or replace function public.cruscotto_trend_12m(p_company_id uuid)
returns table (mese_key text, venduto numeric, incassato numeric, cassa numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months' as from_local
  ),
  months as (
    select to_char(date_trunc('month', (now() at time zone 'Europe/Rome')) - make_interval(months => gs), 'YYYY-MM') as k
    from generate_series(0, 11) gs
  ),
  venduto as (
    select to_char(date_trunc('month', o.created_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           sum(coalesce(o.total_amount, 0)) as v
    from orders o, bounds b
    where o.company_id = p_company_id
      and (o.created_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  ),
  incassato as (
    select to_char(date_trunc('month', oi.paid_date::timestamp), 'YYYY-MM') as k,
           sum(coalesce(oi.amount, 0)) as v
    from order_installments oi
    join orders o on o.id = oi.order_id
    cross join bounds b
    where o.company_id = p_company_id
      and oi.is_paid = true
      and oi.paid_date >= b.from_local::date
    group by 1
  ),
  costi as (
    select to_char(date_trunc('month', cc.paid_date::timestamp), 'YYYY-MM') as k,
           sum(coalesce(cc.amount, 0)) as v
    from company_costs cc, bounds b
    where cc.company_id = p_company_id
      and cc.is_paid = true
      and cc.paid_date >= b.from_local::date
    group by 1
  )
  select m.k,
         coalesce(v.v, 0)::numeric  as venduto,
         coalesce(i.v, 0)::numeric  as incassato,
         (coalesce(i.v, 0) - coalesce(c.v, 0))::numeric as cassa
  from months m
  left join venduto   v on v.k = m.k
  left join incassato i on i.k = m.k
  left join costi     c on c.k = m.k
  order by m.k;
$$;

create or replace function public.marketing_trend_12m(p_company_id uuid)
returns table (mese_key text, lead integer, appuntamenti integer, contratti integer)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months' as from_local
  ),
  months as (
    select to_char(date_trunc('month', (now() at time zone 'Europe/Rome')) - make_interval(months => gs), 'YYYY-MM') as k
    from generate_series(0, 11) gs
  ),
  leads as (
    select to_char(date_trunc('month', mc.created_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           count(*) as v
    from marketing_contacts mc, bounds b
    where mc.company_id = p_company_id
      and (mc.created_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  ),
  appts as (
    select to_char(date_trunc('month', a.appointment_date::timestamp), 'YYYY-MM') as k,
           count(*) as v
    from appointments a, bounds b
    where a.company_id = p_company_id
      and a.appointment_date >= b.from_local::date
    group by 1
  ),
  won as (
    select to_char(date_trunc('month', mo.updated_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           count(*) as v
    from marketing_opportunities mo, bounds b
    where mo.company_id = p_company_id
      and mo.status = 'won'
      and (mo.updated_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  )
  select m.k,
         coalesce(l.v, 0)::integer as lead,
         coalesce(a.v, 0)::integer as appuntamenti,
         coalesce(w.v, 0)::integer as contratti
  from months m
  left join leads l on l.k = m.k
  left join appts a on a.k = m.k
  left join won   w on w.k = m.k
  order by m.k;
$$;

revoke execute on function public.cruscotto_trend_12m(uuid) from anon;
revoke execute on function public.marketing_trend_12m(uuid) from anon;
grant execute on function public.cruscotto_trend_12m(uuid) to authenticated;
grant execute on function public.marketing_trend_12m(uuid) to authenticated;
