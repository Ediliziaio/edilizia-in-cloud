CREATE OR REPLACE FUNCTION public.rate_incassi(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, data date, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (select x.* from public.rate_importi(p_company) x join public.orders o on o.id=x.order_id where not (o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura') and not exists(select 1 from public.unita_immobiliari u where u.order_id=o.id)),
  mv as (
    select m.documento_id, m.data_movimento, m.importo
      from public.movimenti_cassa_native m
     where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
  ),
  tot as (select mv.documento_id, sum(mv.importo) as t, max(mv.data_movimento) as ultima from mv group by mv.documento_id)
  select r.order_id, r.installment_id, coalesce(r.paid_date, r.expected_date), r.importo
    from r where r.is_paid and r.documento_fiscale_id is null
  union all
  select r.order_id, r.installment_id, mv.data_movimento, mv.importo
    from r join mv on mv.documento_id = r.documento_fiscale_id
  union all
  select r.order_id, r.installment_id, coalesce(r.paid_date, t.ultima), r.importo - t.t
    from r join tot t on t.documento_id = r.documento_fiscale_id
   where r.is_paid and r.importo <> t.t and abs(r.importo - t.t) <= 0.011
  union all
  select d.order_id,coalesce(d.documento_id,d.invoice_id),coalesce(d.pagato_il,d.scadenza),d.pagato_lordo
    from public.commessa_documenti_credito(p_company) d join public.orders o on o.id=d.order_id
   where o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura' and d.pagato_lordo>0
  union all
  select pn.order_id,pn.id,pn.entry_date,pn.amount
    from public.prima_nota_entries pn join public.unita_immobiliari u on u.order_id=pn.order_id and u.company_id=pn.company_id
    join public.orders o on o.id=u.order_id and o.deleted_at is null
   where pn.company_id=p_company and pn.direction='entrata' and pn.reversal_of is null
     and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=pn.id)
$function$
