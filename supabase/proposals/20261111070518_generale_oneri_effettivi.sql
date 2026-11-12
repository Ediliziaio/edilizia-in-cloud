-- Apply after native general-project modules. Existing privileged helper only; no public execution.
-- Future/pending interest and fees are forecasts, excluded from actuals and monthly photographs.
create or replace function public.generale_piano_righe_reali(p_generale_id uuid, p_costi boolean, p_ricavi boolean)
returns table (
  id text, fonte text, rif_id uuid, order_id uuid, data date, tipo text,
  chiave text, categoria text, descrizione text, importo numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s as materialized (
    select o.id, o.company_id
      from public.orders o
     where o.deleted_at is null
       and (o.id = p_generale_id or o.commessa_generale_id = p_generale_id)
  ),
  m as materialized (
    select v.id, v.consuntivo, v.costo_materiali_magazzino, v.costo_rimborsi_km
      from public.v_ordine_marginalita v
     where p_costi and v.id in (select s.id from s)
  ),
  costi as materialized (
    -- Spese portate sulla commessa: anche le fatture ricevute contabilizzate.
    select 'spesa'::text as fonte, cc.id as rif_id, cc.order_id,
           coalesce(cc.paid_date, cc.due_date, cc.created_at::date) as data,
           public.generale_piano_chiave_costo(cc.category) as chiave, cc.category as categoria,
           concat_ws(' · ', coalesce(nullif(btrim(cc.name), ''), 'Spesa'), su.name,
                     (select 'fattura ' || string_agg(fr.numero_fattura, ', ')
                        from public.fatture_ricevute fr
                       where fr.company_cost_id = cc.id and fr.company_id = cc.company_id)) as descrizione,
           coalesce(cc.amount, 0) as importo
      from public.company_costs cc
      join s on s.id = cc.order_id
      left join public.suppliers su on su.id = cc.supplier_id
     where p_costi
       and cc.purchase_order_id is null and cc.order_external_team_id is null
       and (cc.allocations is null or jsonb_typeof(cc.allocations) <> 'array' or jsonb_array_length(cc.allocations) = 0)
    union all
    -- Spese divise tra più commesse: la parte di ognuna.
    select 'spesa_divisa', cc.id, (a.value ->> 'order_id')::uuid,
           coalesce(cc.paid_date, cc.due_date, cc.created_at::date),
           public.generale_piano_chiave_costo(cc.category), cc.category,
           concat_ws(' · ', coalesce(nullif(btrim(cc.name), ''), 'Spesa'), su.name, (a.value ->> 'pct') || '%'),
           coalesce(cc.amount, 0) * (a.value ->> 'pct')::numeric / 100
      from public.company_costs cc
      cross join lateral jsonb_array_elements(cc.allocations) a(value)
      left join public.suppliers su on su.id = cc.supplier_id
     where p_costi
       and cc.company_id in (select s.company_id from s)
       and jsonb_typeof(cc.allocations) = 'array' and jsonb_array_length(cc.allocations) > 0
       and cc.purchase_order_id is null and cc.order_external_team_id is null
       and (a.value ->> 'order_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       and (a.value ->> 'pct') ~ '^[0-9]+(\.[0-9]+)?$'
       and (a.value ->> 'order_id')::uuid in (select s.id from s)
    union all
    -- Ordini d'acquisto: stesso conto di marginalita_costo_oda.
    select 'oda', po.id, po.order_id, coalesce(po.issue_date, po.created_at::date),
           'materiali', null::text,
           concat_ws(' · ', 'OdA ' || coalesce(po.oda_number, ''), su.name),
           case when cct.tot is null and qf.tot is null then coalesce(po.subtotal, 0)
                else greatest(0, greatest(coalesce(po.subtotal, 0), coalesce(cct.tot, 0) + coalesce(qf.tot, 0) + coalesce(nc.tot, 0))
                                 - coalesce(nc.tot, 0)) end
      from public.purchase_orders po
      join s on s.id = po.order_id and s.company_id = po.company_id
      left join public.suppliers su on su.id = po.supplier_id
      left join lateral (select sum(coalesce(c.amount, 0)) as tot
                           from public.company_costs c
                          where c.purchase_order_id = po.id and c.company_id = po.company_id) cct on true
      left join lateral (select sum(q.importo) as tot
                           from public.fattura_ricevuta_ordini q
                           join public.fatture_ricevute fr on fr.id = q.fattura_id and fr.company_id = q.company_id
                          where q.purchase_order_id = po.id and q.company_id = po.company_id
                            and fr.stato = 'contabilizzata' and fr.company_cost_id is not null) qf on true
      left join lateral (select sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                           from public.fatture_ricevute fr
                           join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                          where c.purchase_order_id = po.id and c.company_id = po.company_id
                            and fr.tipo_documento in ('TD04', 'passive_credit_note')) nc on true
     where p_costi and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
    union all
    select 'magazzino', null::uuid, m.id, null::date, 'materiali', null::text,
           'Materiali presi dal magazzino', m.costo_materiali_magazzino
      from m
    union all
    select 'ore', oe.id, oe.order_id, coalesce(oe.paid_date, oe.created_at::date), 'manodopera', null::text,
           concat_ws(' · ', 'Ore', nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
                     case when oe.hours_worked is not null then trim(to_char(oe.hours_worked, 'FM999G990D0')) || ' h' end),
           coalesce(oe.total_cost, 0)
      from public.order_employees oe
      join s on s.id = oe.order_id
      left join public.employees e on e.id = oe.employee_id
     where p_costi
    union all
    select 'squadra', ot.id, ot.order_id, coalesce(ot.paid_date, ot.payment_date, ot.created_at::date), 'subappalti', null::text,
           concat_ws(' · ', 'Squadra esterna', et.name),
           coalesce(ot.total_cost, 0) / (1 + coalesce(ot.vat_rate, 22) / 100)
      from public.order_external_teams ot
      join s on s.id = ot.order_id
      left join public.external_teams et on et.id = ot.external_team_id
     where p_costi
    union all
    select 'errore', oe.id, oe.order_id, coalesce(oe.error_date, oe.created_at::date), 'imprevisti', null::text,
           concat_ws(' · ', 'Errore', nullif(btrim(oe.description), '')), coalesce(oe.amount, 0)
      from public.order_errors oe
      join s on s.id = oe.order_id
     where p_costi
    union all
    select 'provvigione', osp.id, osp.order_id, coalesce(osp.paid_date, osp.payment_expected_date, osp.created_at::date),
           'commercializzazione', null::text,
           concat_ws(' · ', 'Provvigione', nullif(btrim(concat_ws(' ', sp.first_name, sp.last_name)), '')),
           greatest(greatest(coalesce(osp.commission_amount, 0), 0) - greatest(coalesce(osp.deduction_amount, 0), 0), 0)
      from public.order_salespeople osp
      join s on s.id = osp.order_id
      left join public.salespeople sp on sp.id = osp.salesperson_id
     where p_costi
    union all
    select 'rimborsi_km', null::uuid, m.id, null::date, 'manodopera', null::text,
           'Rimborsi chilometrici approvati', m.costo_rimborsi_km
      from m
    union all
    -- Interessi e spese pagati su mutui e finanziamenti (modulo Investitori, 20281031140500).
    select 'debito', fm.id, p_generale_id, fm.data, 'finanziari', null::text,
           concat_ws(' · ', case fm.tipo when 'interessi' then 'Interessi' else 'Spese' end, nullif(btrim(f.nome), ''), nullif(btrim(fm.nota), '')),
           coalesce(fm.importo, 0)
      from public.generale_fonti_movimenti fm
      join public.generale_fonti f on f.id = fm.fonte_id and f.company_id = fm.company_id
     where p_costi
       and fm.generale_id = p_generale_id
       and fm.company_id in (select s.company_id from s)
       and fm.tipo in ('interessi', 'spese')
       and fm.data <= current_date
       and coalesce(fm.nota, '') not like '%[EIC:MOVIMENTO_PREVISTO]%'
  ),
  rettifiche as (
    -- In pratica sono i materiali degli OdA rientrati in magazzino: si contano coi materiali.
    select 'rettifica'::text as fonte, null::uuid as rif_id, m.id as order_id, null::date as data,
           'materiali'::text as chiave, null::text as categoria,
           'Materiali rientrati in magazzino e arrotondamenti (differenza col consuntivo della commessa)'::text as descrizione,
           m.consuntivo - coalesce(t.tot, 0) as importo
      from m
      left join (select c.order_id, sum(c.importo) as tot from costi c group by c.order_id) t on t.order_id = m.id
     where abs(m.consuntivo - coalesce(t.tot, 0)) >= 0.01
  ),
  ricavi as (
    select 'fattura'::text as fonte, i.id as rif_id, i.order_id, i.issue_date as data,
           'ricavi'::text as chiave, null::text as categoria,
           concat_ws(' · ', 'Fattura ' || coalesce(i.invoice_number, ''), nullif(btrim(i.client_company_name), '')) as descrizione,
           coalesce(i.subtotal, coalesce(i.total, 0) - coalesce(i.tax_amount, 0))
             - coalesce((select sum(coalesce(nc.subtotal, coalesce(nc.total, 0) - coalesce(nc.tax_amount, 0)))
                           from public.invoices nc
                          where nc.credited_invoice_id = i.id
                            and nc.document_type in ('credit_note', 'nota_credito')
                            and nc.deleted_at is null
                            and coalesce(nc.status, '') <> 'cancelled'), 0) as importo
      from public.invoices i
      join s on s.id = i.order_id and s.company_id = i.company_id
     where p_ricavi
       and i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
    union all
    -- Unità rogitate (modulo Unità, 20281031120000): il prezzo di rogito è il ricavo.
    -- Se sulla commessa dell'unità ci sono fatture, contano quelle e il rogito no.
    select 'rogito', u.id, u.order_id, u.data_rogito,
           'ricavi', null::text,
           concat_ws(' · ', 'Rogito', nullif(btrim(o.description), '')),
           coalesce(u.prezzo_rogito, u.prezzo_trattato, u.prezzo_listino, 0)
      from public.unita_immobiliari u
      join s on s.id = u.order_id and s.company_id = u.company_id
      join public.orders o on o.id = u.order_id
     where p_ricavi
       and u.stato_vendita = 'rogitata' and u.divisa_il is null
       and not exists (select 1 from public.invoices i2
                        where i2.order_id = u.order_id and i2.deleted_at is null
                          and i2.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
                          and i2.status not in ('cancelled', 'canceled', 'annullata', 'credited'))
  )
  select x.fonte || ':' || coalesce(x.rif_id::text, '-') || ':' || x.order_id::text,
         x.fonte, x.rif_id, x.order_id, x.data, 'costo'::text,
         x.chiave, x.categoria, x.descrizione, round(x.importo, 2)
    from (select * from costi union all select * from rettifiche) x
   where round(x.importo, 2) <> 0
  union all
  select r.fonte || ':' || r.rif_id::text || ':' || r.order_id::text,
         r.fonte, r.rif_id, r.order_id, r.data, 'ricavo'::text,
         r.chiave, r.categoria, r.descrizione, round(r.importo, 2)
    from ricavi r
   where round(r.importo, 2) <> 0;
$$;

revoke all on function public.generale_piano_righe_reali(uuid, boolean, boolean) from public, anon, authenticated;
