-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali: i moduli si parlano
-- ════════════════════════════════════════════════════════════════════════════
-- Dopo l'unione dei moduli (contratto, piano, unità, documenti, investitori):
--
--   1. Il reale del piano economico conta anche:
--      · interessi e spese pagati su mutui e finanziamenti (oneri finanziari);
--      · il prezzo di rogito delle unità vendute, se sulla loro commessa non ci
--        sono fatture (con le fatture contano quelle).
--   2. Gli incassi del piano contano caparre, acconti e saldi delle unità, con
--      la stessa regola: niente fatture sulla commessa dell'unità.
--   3. Il riepilogo della generale:
--      · conta fatture e incassi registrati sulla generale stessa (SAL di
--        contratto fatturato sul contratto), e anche le fatture fatte con la
--        fatturazione dell'app (documenti_fiscali), non solo le importate;
--      · dice quali figlie sono unità divise (valgono zero: non sono «in perdita»);
--      · dà per ogni figlia caparre e acconti incassati (per la fideiussione 122/2005).
--
-- Le funzioni 1-2 sono quelle di 20281031110000 con le righe in più; firme,
-- permessi e chiamanti non cambiano. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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

create or replace function public.generale_piano_incassi(p_generale_id uuid)
returns table (fattura_id uuid, data date, importo numeric)
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
  f as materialized (
    select i.id, i.status, i.issue_date, i.due_date, i.payment_date,
           coalesce(i.total, 0) as totale, coalesce(i.paid_amount, 0) as pagato,
           case when coalesce(i.total, 0) > 0
                then coalesce(i.subtotal, i.total - coalesce(i.tax_amount, 0)) / i.total else 1 end as quota_netta
      from public.invoices i
      join s on s.id = i.order_id and s.company_id = i.company_id
     where i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
  ),
  p as (
    select ip.invoice_id, ip.payment_date, sum(coalesce(ip.amount, 0)) as importo
      from public.invoice_payments ip
      join f on f.id = ip.invoice_id
     group by ip.invoice_id, ip.payment_date
  )
  select p.invoice_id, p.payment_date, round(p.importo * f.quota_netta, 2)
    from p join f on f.id = p.invoice_id
   where round(p.importo * f.quota_netta, 2) <> 0
  union all
  select f.id, coalesce(f.payment_date, f.due_date, f.issue_date),
         round((case when f.status in ('paid', 'pagata') then f.totale - public.nc_collegate_importo(f.id)
                     else least(f.pagato, f.totale) end) * f.quota_netta, 2)
    from f
   where not exists (select 1 from p where p.invoice_id = f.id)
     and (f.status in ('paid', 'pagata') or f.pagato > 0)
  union all
  -- Caparre, acconti e saldi delle unità (modulo Unità), dove la commessa dell'unità non ha
  -- fatture: con le fatture contano i loro pagamenti, e l'incasso non si conta due volte.
  select um.id, um.data, um.importo
    from public.unita_movimenti um
    join public.unita_immobiliari u on u.id = um.unita_id and u.company_id = um.company_id
    join s on s.id = u.order_id and s.company_id = u.company_id
   where um.tipo in ('caparra', 'acconto', 'saldo')
     and not exists (select 1 from f join public.invoices i3 on i3.id = f.id where i3.order_id = u.order_id);
$$;

-- Le fatture di un gruppo di commesse, con le stesse regole del cruscotto:
--   · fatture dell'app (documenti_fiscali, legate con ordine_id): fattura e fattura PA
--     in più, nota di credito in meno; bozze, annullate e rifiutate no;
--   · fatture importate (invoices): solo fatture vere, al netto delle note collegate,
--     e non la copia di una fattura dell'app (stessa commessa, stesso giorno, stesso totale).
-- Importi IVA compresa, come la scala della generale.
create or replace function public.generale_fatture_righe(p_azienda uuid, p_ordini uuid[])
returns table (order_id uuid, fatturato numeric, incassato numeric)
language sql
stable
security definer
set search_path = public
as $$
  with app as (
    select d.ordine_id as order_id, d.data_emissione as giorno,
           case when d.tipo = 'nota_credito' then -1 else 1 end * coalesce(d.totale_documento, 0) as fatturato,
           case when d.tipo = 'nota_credito' then 0
                when d.stato = 'pagata' then coalesce(d.totale_documento, 0)
                else least(coalesce(d.importo_pagato, 0), coalesce(d.totale_documento, 0)) end as incassato,
           coalesce(d.totale_documento, 0) as totale
      from public.documenti_fiscali d
     where d.company_id = p_azienda and d.deleted_at is null
       and d.ordine_id = any (p_ordini)
       and d.tipo in ('fattura', 'fattura_pa', 'nota_credito')
       and coalesce(d.stato, '') not in ('bozza', 'annullata', 'rifiutata')
  )
  select a.order_id, a.fatturato, a.incassato from app a
  union all
  select i.order_id,
         coalesce(i.total, 0) - public.nc_collegate_importo(i.id),
         case when i.status in ('paid', 'pagata') then coalesce(i.total, 0) - public.nc_collegate_importo(i.id)
              else least(coalesce(i.paid_amount, 0), coalesce(i.total, 0)) end
    from public.invoices i
   where i.company_id = p_azienda
     and i.order_id = any (p_ordini)
     and i.deleted_at is null
     and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
     and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
     and not exists (select 1 from app a where a.order_id = i.order_id and a.giorno = i.issue_date and abs(a.totale - coalesce(i.total, 0)) < 0.01);
$$;

revoke all on function public.generale_fatture_righe(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.commessa_generale_riepilogo(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_generale jsonb;
  v_figlie jsonb;
  v_fatture_generale jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);

  select jsonb_build_object(
           'id', o.id, 'codice', o.order_code, 'nome', o.description, 'cliente', o.client_name,
           'cliente_id', o.customer_id, 'modello', g.modello, 'creata_il', o.created_at,
           'valore', case when v_importi then g.valore_riferimento end)
    into v_generale
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_generale is null then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;

  with figlie as (
    select o.id, o.order_code, o.description, o.status, o.work_address, o.work_start_date, o.work_end_date,
           coalesce(o.total_amount, 0) as importo,
           coalesce(o.percentuale_avanzamento, 0) as avanzamento,
           s.name as stato_nome, s.color as stato_colore,
           u.divisa_il is not null as divisa,
           coalesce((select sum(um.importo) from public.unita_movimenti um
                      where um.unita_id = u.id and um.tipo in ('caparra', 'acconto')), 0) as acconti
      from public.orders o
      left join public.unita_immobiliari u on u.order_id = o.id
      left join public.order_statuses s on s.id = o.current_status_id
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
  ),
  fatture as (
    select x.order_id, sum(x.fatturato) as fatturato, sum(x.incassato) as incassato
      from public.generale_fatture_righe(v_azienda, array(select id from figlie)) x
     group by x.order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'codice', f.order_code, 'nome', f.description,
           'stato', f.status, 'stato_nome', f.stato_nome, 'stato_colore', f.stato_colore,
           'indirizzo', f.work_address, 'inizio', f.work_start_date, 'fine', f.work_end_date,
           'avanzamento', f.avanzamento,
           'divisa', f.divisa,
           'acconti', case when v_importi then f.acconti end,
           'importo', case when v_importi then f.importo end,
           'eseguito', case when v_importi then round(f.importo * f.avanzamento / 100, 2) end,
           'fatturato', case when v_importi then coalesce(ft.fatturato, 0) end,
           'incassato', case when v_importi then coalesce(ft.incassato, 0) end,
           'costo', case when v_costi then m.consuntivo end,
           'margine', case when v_margini then m.margine end
         ) order by f.order_code nulls last, f.description), '[]'::jsonb)
    into v_figlie
    from figlie f
    left join fatture ft on ft.order_id = f.id
    left join public.v_ordine_marginalita m on m.id = f.id;

  -- Fatture registrate sulla generale stessa (es. SAL di contratto fatturato sul contratto).
  select case when v_importi then jsonb_build_object(
           'fatturato', coalesce(sum(x.fatturato), 0),
           'incassato', coalesce(sum(x.incassato), 0)) end
    into v_fatture_generale
    from public.generale_fatture_righe(v_azienda, array[p_generale_id]) x;

  return jsonb_build_object(
    'generale', v_generale,
    'figlie', v_figlie,
    'fatture_generale', v_fatture_generale,
    'permessi', jsonb_build_object('importi', v_importi, 'costi', v_costi, 'margini', v_margini)
  );
end;
$$;

revoke all on function public.commessa_generale_riepilogo(uuid) from public, anon;
grant execute on function public.commessa_generale_riepilogo(uuid) to authenticated;

revoke all on function public.generale_piano_righe_reali(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.generale_piano_incassi(uuid) from public, anon, authenticated;
