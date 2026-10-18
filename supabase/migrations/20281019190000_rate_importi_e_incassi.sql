-- Rate e incassi con gli importi della scheda commessa (19/10/2026).
--
--  1. rate_importi: per ogni rata l'importo che conta davvero, come in calculateInstallmentCollections:
--     il saldo finale è il residuo (contratto più varianti, IVA inclusa, meno le altre rate, meno il
--     costo della finanziaria); se il saldo non basta ad assorbire quel costo, la parte che avanza
--     si toglie dalla rata della finanziaria. rate_da_incassare ora parte da qui.
--  2. Incassi (get_metric revenue_real): il saldo pagato conta per il suo residuo, non per l'importo
--     scritto sulla rata; le fatture emesse dall'app contano con i loro incassi
--     (movimenti_cassa_native). Per non contare due volte, le fatture importate (invoice_payments)
--     valgono solo per le aziende che non fatturano dall'app.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.rate_importi(p_company uuid)
returns table (installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean,
               paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc,
           coalesce(v.var, 0) var
      from public.orders o
      left join (select v.order_id, sum(coalesce(v.impatto_economico, 0)) var
                   from public.ordini_variazione v where v.status = 'approvato' group by v.order_id) v on v.order_id = o.id
     where o.company_id = p_company and o.deleted_at is null
  ),
  r0 as (
    select i.*, row_number() over (partition by i.order_id
                                   order by (i.type = 'balance') desc, i.position desc nulls last, i.id desc) as rn
      from public.order_installments i join o on o.id = i.order_id
  ),
  r1 as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre
      from r0
  ),
  r2 as (
    select r1.*, o.fc,
           round((o.tot + o.var) * (1 + o.iva / 100) - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    -- quanto del costo della finanziaria il saldo non riesce ad assorbire
    select r2.*, greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)) as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3
$$;
revoke all on function public.rate_importi(uuid) from public, anon, authenticated;

create or replace function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc,
           coalesce(v.var, 0) var
      from public.orders o
      left join (select v.order_id, sum(coalesce(v.impatto_economico, 0)) var
                   from public.ordini_variazione v where v.status = 'approvato' group by v.order_id) v on v.order_id = o.id
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company))
  select r.order_id, r.installment_id, r.expected_date,
         greatest(0, r.importo - coalesce(d.importo_pagato, 0)), r.type = 'financing'
    from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
   where not r.is_paid
  union all
  -- Piano senza saldo: la parte del totale non coperta da nessuna rata.
  select s.order_id, null::uuid, null::date, s.scoperto, false
    from (select r.order_id, round((o.tot + o.var) * (1 + o.iva / 100) - o.fc - sum(r.importo), 2) as scoperto
            from r join o on o.id = r.order_id
           group by r.order_id, o.tot, o.var, o.iva, o.fc
          having not bool_or(r.type = 'balance')) s
   where s.scoperto > 0
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$FROM \(select ip\.amount, ip\.payment_date, ip\.company_id from invoice_payments ip[\s\S]*?and i\.documento_fiscale_id is null and i\.invoice_id is null\) incassi$re$,
  $to$FROM (-- fatture importate: solo per chi non fattura dall'app (la Demo 2 le ha in tutti e due)
            select ip.amount, ip.payment_date, ip.company_id from invoice_payments ip
             where not exists (select 1 from public.documenti_fiscali df where df.company_id = ip.company_id)
            union all
            -- fatture emesse dall'app
            select m.importo, m.data_movimento, m.company_id from public.movimenti_cassa_native m
             where m.tipo = 'incasso' and m.documento_id is not null
            union all
            -- rate pagate senza fattura, con l'importo che conta (il saldo è il residuo)
            select x.importo, x.paid_date, v_company_id from public.rate_importi(v_company_id) x
             where x.is_paid and x.paid_date is not null
               and x.documento_fiscale_id is null and x.invoice_id is null) incassi$to$,
  'select x.importo, x.paid_date, v_company_id from public.rate_importi(v_company_id) x');
