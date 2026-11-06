CREATE OR REPLACE FUNCTION public.cliente_rate_commesse(p_order_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_id uuid, company_id uuid, order_code text, description text, installment_id uuid, posizione integer, label text, tipo text, importo numeric, residuo numeric, is_paid boolean, paid_date date, expected_date date, finanziamento boolean, totale_commessa numeric, incassato_commessa numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  -- Le aziende delle commesse di cui l'utente è cliente (e a cui il suo profilo appartiene).
  for v_company in
    select distinct o.company_id
      from public.orders o
     where o.customer_id = v_uid and o.deleted_at is null
       and (p_order_id is null or o.id = p_order_id)
       and coalesce(public.user_can_access_company(o.company_id), false)
  loop
    return query
    with mie as materialized (
      select o.id, o.order_code, o.description,
             round((coalesce(o.total_amount, 0)
                    + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                                 where v.order_id = o.id and v.status = 'approvato'), 0))
                   * (1 + coalesce(o.vat_rate, 22) / 100), 2)
             - case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end as totale
        from public.orders o
       where o.company_id = v_company and o.customer_id = v_uid and o.deleted_at is null
         and (p_order_id is null or o.id = p_order_id)
    ),
    ri as materialized (select r.* from public.rate_importi(v_company) r join mie on mie.id = r.order_id),
    da as materialized (select d.* from public.rate_da_incassare(v_company) d join mie on mie.id = d.order_id),
    inc as materialized (
      select x.order_id, sum(x.importo) as i
        from public.rate_incassi(v_company) x join mie on mie.id = x.order_id
       group by x.order_id
    ),
    righe as (
      select ri.order_id, ri.installment_id, oi.position as pos_salvata, nullif(btrim(oi.label), '') as etichetta,
             ri.type as tipo, ri.importo, coalesce(da.residuo, 0) as residuo, ri.is_paid, ri.paid_date,
             ri.expected_date, ri.type = 'financing' as finanziamento
        from ri
        left join da on da.installment_id = ri.installment_id
        left join public.order_installments oi on oi.id = ri.installment_id
      union all
      select da.order_id, null::uuid, null::int, null::text, 'non_pianificato', da.residuo, da.residuo, false,
             null::date, null::date, false
        from da
       where da.installment_id is null and da.residuo > 0
    )
    select r.order_id, v_company, mie.order_code, mie.description, r.installment_id,
           (row_number() over (partition by r.order_id
                               order by r.tipo = 'non_pianificato', r.pos_salvata nulls last,
                                        case r.tipo when 'deposit' then 0 when 'financing' then 2 else 3 end,
                                        r.expected_date nulls last, r.installment_id))::int,
           coalesce(r.etichetta,
                    case r.tipo when 'deposit' then 'Acconto' when 'balance' then 'Saldo'
                                when 'financing' then 'Finanziamento' when 'non_pianificato' then 'Da pianificare'
                                else 'Rata' end),
           r.tipo, r.importo, r.residuo, r.is_paid, r.paid_date, r.expected_date, r.finanziamento,
           mie.totale, coalesce(inc.i, 0)
      from righe r
      join mie on mie.id = r.order_id
      left join inc on inc.order_id = r.order_id;
  end loop;
end
$function$
