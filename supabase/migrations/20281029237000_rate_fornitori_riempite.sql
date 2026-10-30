-- ════════════════════════════════════════════════════════════════════════════
-- Le rate dei costi che c'erano già, e la vista RiBa che le legge
-- ════════════════════════════════════════════════════════════════════════════
-- Seguito di 20281029236000_rate_fornitori (struttura e regole). Separata
-- apposta: quella crea regole d'accesso, e su questo progetto una CREATE
-- POLICY tiene bloccato il login finché la transazione non finisce. Questa non
-- ne crea, quindi può durare qualche secondo in più senza fermare nessuno.
--
-- 1. Ogni fattura già diventata costo riceve le sue rate, con la stessa
--    funzione che da ora in poi lo fa da sola (`crea_rate_fornitore`). Se il
--    costo è pagato, le rate nascono pagate, con la data del costo se c'è —
--    senza inventarne una quando non c'è.
--    Attese: 1.291 rate. renova 228 (205 fatture a una rata, 2 a più rate
--    — 2 e 4 —, 17 con un XML senza rate che ricevono una rata col totale),
--    Dimora 39 e Demo 2 1.024 (senza XML: una rata per fattura col totale).
--
-- 2. `v_riba_fornitori` legge le rate invece di rileggere l'XML a ogni
--    richiesta, e unisce lo stato REGISTRATO (avvisata, da bloccare,
--    richiamata, insoluta, pagata) a quello CALCOLATO dalla data (passata, in
--    arrivo, futura). Un'avvisata la cui data è passata si mostra «passata»:
--    la banca l'aveva annunciata, e il giorno è venuto.
--
-- 3. Controllo finale: ogni fattura-costo ha almeno una rata, e nessun costo
--    dice «pagato» mentre una sua rata è aperta (o il contrario).
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- ── 1. Le rate dei costi esistenti ──────────────────────────────────────────

do $riempi$
declare
  v_f     record;
  v_tot   integer := 0;
  v_rate  integer;
begin
  for v_f in
    select f.id as fattura_id, f.company_cost_id
      from public.fatture_ricevute f
     where f.company_cost_id is not null
       and coalesce(f.tipo_documento, '') not in ('TD04', 'passive_credit_note')
     order by f.company_cost_id, f.data_fattura, f.id
  loop
    v_tot := v_tot + public.crea_rate_fornitore(v_f.company_cost_id, v_f.fattura_id);
  end loop;

  select count(*) into v_rate from public.rate_fornitori;
  raise notice 'Rate create: %, rate totali: %', v_tot, v_rate;
end
$riempi$;

-- ── 2. La vista RiBa legge le rate ──────────────────────────────────────────

drop view if exists public.v_riba_fornitori;

create view public.v_riba_fornitori
with (security_invoker = on) as
with dalle_rate as (
  select
    r.id                  as rata_id,
    r.company_cost_id     as cost_id,
    r.company_id,
    cc.supplier_id,
    coalesce(s.name, f.cedente_ragione_sociale, cc.name) as fornitore,
    cc.order_id,
    r.fattura_ricevuta_id as fattura_id,
    f.numero_fattura,
    f.data_fattura,
    r.numero              as numero_rata,
    count(*) over (partition by r.company_cost_id, r.fattura_ricevuta_id)::int
                          as rate_riba_della_fattura,
    r.scadenza,
    r.importo,
    r.iban,
    r.stato               as stato_registrato,
    r.pagata_il,
    r.nota
  from public.rate_fornitori r
  join public.company_costs cc on cc.id = r.company_cost_id
  left join public.fatture_ricevute f on f.id = r.fattura_ricevuta_id
  left join public.suppliers s on s.id = cc.supplier_id
  where r.metodo = 'riba'
),
-- Un costo segnato RiBa a mano, senza nessuna rata: resta visibile come una.
a_mano as (
  select
    null::uuid as rata_id,
    cc.id      as cost_id,
    cc.company_id,
    cc.supplier_id,
    coalesce(s.name, cc.name) as fornitore,
    cc.order_id,
    null::uuid as fattura_id, null::text as numero_fattura, null::date as data_fattura,
    1 as numero_rata, 1 as rate_riba_della_fattura,
    nullif(cc.due_date, date '9999-12-31') as scadenza,
    round(cc.amount * (1 + coalesce(cc.vat_rate, 0) / 100.0), 2) as importo,
    null::text as iban,
    case when cc.is_paid then 'pagata' else 'da_pagare' end as stato_registrato,
    cc.paid_date as pagata_il,
    null::text as nota
  from public.company_costs cc
  left join public.suppliers s on s.id = cc.supplier_id
  where cc.payment_method = 'riba'
    and not exists (select 1 from public.rate_fornitori r where r.company_cost_id = cc.id)
),
tutte as (
  select * from dalle_rate
  union all
  select * from a_mano
)
select
  t.rata_id,
  t.cost_id,
  t.company_id,
  t.supplier_id,
  t.fornitore,
  t.order_id,
  o.order_code,
  t.fattura_id,
  t.numero_fattura,
  t.data_fattura,
  t.numero_rata,
  t.rate_riba_della_fattura,
  t.scadenza,
  t.importo,
  t.iban,
  t.stato_registrato,
  t.pagata_il,
  t.nota,
  case
    when t.stato_registrato in ('pagata', 'insoluta', 'richiamata', 'da_bloccare') then t.stato_registrato
    when t.scadenza is null                    then 'senza_data'
    when t.scadenza < current_date             then 'passata'
    when t.stato_registrato = 'avvisata'       then 'avvisata'
    when t.scadenza <= current_date + 30       then 'in_arrivo'
    else 'futura'
  end as stato,
  case when t.scadenza is not null then t.scadenza - current_date end as giorni
from tutte t
left join public.orders o on o.id = t.order_id;

comment on view public.v_riba_fornitori is
  'Una riga per ogni RiBa da pagare ai fornitori, dalle rate (rate_fornitori) o dai costi segnati RiBa a mano senza rate. stato = quello registrato (pagata, insoluta, richiamata, da_bloccare, avvisata) quando c''è, altrimenti quello della data: passata | in_arrivo (30 gg) | futura | senza_data.';

revoke all on public.v_riba_fornitori from public, anon;
grant select on public.v_riba_fornitori to authenticated, service_role;

-- ── 3. Controllo ────────────────────────────────────────────────────────────

do $$
declare
  v_senza    integer;
  v_incoer   integer;
  v_renova   integer;
begin
  select count(*) into v_senza
    from public.fatture_ricevute f
   where f.company_cost_id is not null
     and coalesce(f.tipo_documento, '') not in ('TD04', 'passive_credit_note')
     and not exists (select 1 from public.rate_fornitori r
                      where r.company_cost_id = f.company_cost_id and r.fattura_ricevuta_id = f.id);
  if v_senza > 0 then
    raise exception 'Restano % fatture-costo senza rate', v_senza;
  end if;

  select count(*) into v_incoer
    from public.company_costs cc
   where exists (select 1 from public.rate_fornitori r where r.company_cost_id = cc.id)
     and coalesce(cc.is_paid, false) <>
         not exists (select 1 from public.rate_fornitori r
                      where r.company_cost_id = cc.id and r.stato <> 'pagata');
  if v_incoer > 0 then
    raise exception '% costi dicono «pagato» in modo diverso dalle loro rate', v_incoer;
  end if;

  select count(*) into v_renova
    from public.rate_fornitori r
   where r.company_id = (select id from public.companies where name = 'renova solution srl');
  if v_renova <> 228 then
    raise exception 'renova: attese 228 rate, trovate %', v_renova;
  end if;
end $$;
