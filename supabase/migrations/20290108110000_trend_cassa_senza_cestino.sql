-- Grafico dei 12 mesi del Cruscotto Economico: la cassa senza le commesse nel
-- cestino, da tutti e due i lati (08/11/2026).
--
-- L'incassato del grafico (rate_incassi → rate_importi) salta le commesse nel
-- cestino; i costi pagati no. Su Demo Azienda 2 spariscono 186.456 € incassati
-- fra aprile e luglio 2026 su commesse poi cestinate, mentre i loro costi
-- restano: la «cassa netta» di quei mesi risultava più bassa di quanto fosse.
--
-- Deciso l'08/11/2026: una commessa nel cestino è come se non ci fosse. Si
-- tolgono anche i costi legati a lei (company_costs.order_id). I costi senza
-- commessa restano tutti. Cambia solo il calcolo dei costi: la firma, i
-- permessi e il resto della funzione sono quelli di prima.

create or replace function public.cruscotto_trend_12m(p_company_id uuid)
 returns table(mese_key text, venduto numeric, incassato numeric, cassa numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.utente_bloccato()
     or not coalesce(public.user_can_access_company(p_company_id), false)
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_cruscotto', p_company_id), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return query
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months' as from_local
  ),
  months as (
    select to_char(date_trunc('month', (now() at time zone 'Europe/Rome')) - make_interval(months => gs), 'YYYY-MM') as k
    from generate_series(0, 11) gs
  ),
  vend as (
    select to_char(date_trunc('month', o.created_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           sum(coalesce(o.total_amount, 0)
               + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                            where v.order_id = o.id and v.status = 'approvato'), 0)) as v
    from public.orders o, bounds b
    where o.company_id = p_company_id and o.deleted_at is null
      and (o.created_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  ),
  inc as (
    select to_char(date_trunc('month', x.data::timestamp), 'YYYY-MM') as k, sum(x.importo) as v
    from public.rate_incassi(p_company_id) x cross join bounds b
    where x.data >= b.from_local::date
    group by 1
  ),
  costi as (
    select to_char(date_trunc('month', cc.paid_date::timestamp), 'YYYY-MM') as k,
           sum(coalesce(cc.amount, 0) * (1 + coalesce(cc.vat_rate, 0) / 100)) as v
    from public.company_costs cc, bounds b
    where cc.company_id = p_company_id
      and cc.is_paid = true
      and cc.paid_date >= b.from_local::date
      -- 08/11/2026: come l'incassato, niente costi di commesse nel cestino
      and not exists (select 1 from public.orders oc where oc.id = cc.order_id and oc.deleted_at is not null)
    group by 1
  )
  select m.k,
         round(coalesce(v.v, 0), 2)::numeric,
         round(coalesce(i.v, 0), 2)::numeric,
         round(coalesce(i.v, 0) - coalesce(c.v, 0), 2)::numeric
  from months m
  left join vend  v on v.k = m.k
  left join inc   i on i.k = m.k
  left join costi c on c.k = m.k
  order by m.k;
end $function$;

revoke all on function public.cruscotto_trend_12m(uuid) from public, anon;
grant execute on function public.cruscotto_trend_12m(uuid) to authenticated, service_role;
