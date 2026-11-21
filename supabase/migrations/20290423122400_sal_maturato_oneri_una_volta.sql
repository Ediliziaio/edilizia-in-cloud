-- Il SAL registrato espone il lordo già comprensivo della quota oneri.
create or replace function private.sal_sub_da_fatturare(p_order uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with sal as (
    select coalesce(sum(s.importo_lordo), 0) as maturato
      from public.contratti_subappalto c
      join public.sal_subappaltatori s on s.contratto_id = c.id and s.company_id = c.company_id
     where c.order_id = p_order
       and s.stato in ('verificato', 'pagato')
  )
  select case when sal.maturato <= 0 then 0 else greatest(0, round(
           sal.maturato
           - coalesce((select sum(cc.amount)
                         from public.contratti_subappalto c
                         join public.fatture_ricevute f on f.contratto_subappalto_id = c.id and f.company_id = c.company_id
                         join public.company_costs cc on cc.id = f.company_cost_id
                        where c.order_id = p_order
                          and coalesce(f.stato, '') not in ('annullata', 'scartata', 'rifiutata')), 0)
           - coalesce((select sum(ot.total_cost / (1 + coalesce(ot.vat_rate, 0) / 100))
                         from public.order_external_teams ot
                        where ot.order_id = p_order), 0), 2)) end
    from sal;
$$;
