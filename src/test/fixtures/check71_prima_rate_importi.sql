CREATE OR REPLACE FUNCTION public.rate_importi(p_company uuid)
 RETURNS TABLE(installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean, paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not coalesce(public.user_can_access_company(p_company), false) then
    raise exception 'Accesso non autorizzato a questa azienda.' using errcode = '42501';
  end if;
  return query
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  var as (
    select v.order_id, coalesce(v.impatto_economico, 0) imp,
           coalesce(v.offline_signed_on::date, v.firmato_il::date, v.approval_recorded_at::date,
                    v.richiesto_il::date, v.created_at::date) as il
      from public.ordini_variazione v join o on o.id = v.order_id
     where v.status = 'approvato'
  ),
  src as (
    select i.id, i.order_id, i.type::text as type, i.position, i.amount, i.is_paid, i.paid_date, i.expected_date,
           i.documento_fiscale_id, i.invoice_id
      from public.order_installments i join o on o.id = i.order_id
    union all
    select md5(oo.id::text || ':' || l.tipo || ':' || l.pos)::uuid, oo.id, l.tipo, l.pos, l.importo, l.pagata,
           l.pagata_il, l.attesa_il, null::uuid, null::uuid
      from public.orders oo join o on o.id = oo.id
      cross join lateral (values
        ('deposit', 0, coalesce(oo.deposit_amount, 0), coalesce(oo.deposit_paid, false), oo.deposit_paid_date, oo.deposit_expected_date),
        ('deposit', 1, coalesce(oo.deposit_2_amount, 0), coalesce(oo.deposit_2_paid, false), oo.deposit_2_paid_date, oo.deposit_2_expected_date),
        ('financing', 2, coalesce(oo.financing_amount, 0), coalesce(oo.financing_paid, false), oo.financing_paid_date, oo.financing_expected_date),
        ('balance', 3, coalesce(oo.balance_amount, 0), coalesce(oo.balance_paid, false), oo.balance_paid_date, oo.balance_expected_date)
      ) l(tipo, pos, importo, pagata, pagata_il, attesa_il)
     where not exists (select 1 from public.order_installments x where x.order_id = oo.id)
       and (l.importo > 0 or l.tipo = 'balance')
       and case when coalesce(oo.payment_type, 'standard') = 'standard' then l.tipo <> 'financing'
                else l.pos <> 1 end
       and (coalesce(oo.deposit_amount, 0) + coalesce(oo.deposit_2_amount, 0) + coalesce(oo.financing_amount, 0)
            + coalesce(oo.balance_amount, 0)) > 0
  ),
  r0 as (
    select s.*, row_number() over (partition by s.order_id
                                   order by (s.type = 'balance') desc, s.position desc nulls last, s.id desc) as rn
      from src s
  ),
  r1 as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre
      from r0
  ),
  r2 as (
    select r1.*, o.fc,
           round(round((o.tot + coalesce((select sum(var.imp) from var
                                          where var.order_id = r1.order_id
                                            and (not (r1.finale and coalesce(r1.is_paid, false) and r1.paid_date is not null)
                                                 or var.il <= r1.paid_date)), 0)) * (1 + o.iva / 100), 2)
                 - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    select r2.*,
           least(greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)), r2.fc) as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type::text,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3;
end $function$
