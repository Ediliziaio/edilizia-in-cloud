-- ════════════════════════════════════════════════════════════════════════════
-- Dove si vedono le RiBa: una riga per ogni RiBa da pagare ai fornitori
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di Florin il 29/10/2026: «dove posso vedere gli stati delle RiBa?».
-- Risposta misurata: da nessuna parte. Nessuna vista, nessuno stato, e nella
-- pagina Costi il metodo compariva solo sui debiti GIÀ pagati.
--
-- Una RiBa non è un bonifico. Non decidi tu quando pagarla: la banca te la
-- avvisa una decina di giorni prima e alla scadenza la addebita da sola. Puoi
-- solo bloccarla prima. Se quel giorno sul conto non c'è la provvista va
-- insoluta, e il nome dell'azienda finisce nelle segnalazioni bancarie. Per
-- questo serve vederle UNA PER UNA, con la data: una fattura Centrufficio a
-- quattro RiBa sono quattro addebiti in quattro giorni diversi.
--
-- `v_riba_fornitori` dà una riga per RiBa:
--   · dalle fatture con l'XML: una riga per ogni rata con ModalitaPagamento
--     MP12, con la SUA data e il SUO importo (lordo: è quello che addebita la
--     banca), letti da `rate_pagamento_da_xml()`;
--   · dai costi segnati RiBa a mano (senza XML): una riga per costo, importo
--     lordo calcolato da imponibile e aliquota.
--
-- Lo stato è quello che si può CALCOLARE oggi, e il nome dice la verità:
--   pagata      il costo è segnato pagato;
--   passata     la data è passata e nessuno l'ha segnata: per una RiBa vuol
--               dire quasi sempre «addebitata e non registrata» — oppure
--               insoluta. Si verifica sull'estratto conto, non si indovina;
--   in_arrivo   entro 30 giorni: è la finestra in cui va garantita la provvista;
--   futura      oltre 30 giorni;
--   senza_data  l'XML non dice quando.
--
-- Gli stati che vanno REGISTRATI — avvisata dalla banca, da bloccare,
-- richiamata, insoluta — qui non ci sono e non si fingono: richiedono che ogni
-- RiBa esista come riga a sé (la decisione aperta in
-- docs/flussi-acquisti-pagamenti.md, «Da decidere», punto 1). Per lo stesso
-- motivo, sulle fatture a più RiBa «pagata» vale per tutte insieme: il costo è
-- uno solo.
--
-- Prestazioni: l'XML si legge solo per le fatture che contengono la stringa
-- MP12. Le altre non passano dal lettore.
--
-- Accessi: `security_invoker`, quindi valgono le regole di `company_costs` e
-- `fatture_ricevute` di chi legge. Niente anon.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_riba_fornitori
with (security_invoker = on) as
with rate_xml as (
  select
    cc.id                  as cost_id,
    cc.company_id,
    cc.supplier_id,
    cc.order_id,
    cc.is_paid,
    cc.paid_date,
    f.id                   as fattura_id,
    f.numero_fattura,
    f.data_fattura,
    f.cedente_ragione_sociale,
    r.ordinale::int        as numero_rata,
    (r.e->>'scadenza')::date as scadenza,
    (r.e->>'importo')::numeric as importo,
    r.e->>'iban'           as iban,
    count(*) over (partition by cc.id)::int as rate_riba_della_fattura
  from public.company_costs cc
  join public.fatture_ricevute f on f.company_cost_id = cc.id
  cross join lateral jsonb_array_elements(
    public.rate_pagamento_da_xml(f.xml_raw, f.indice_corpo)
  ) with ordinality as r(e, ordinale)
  where f.xml_raw like '%MP12%'
    and r.e->>'modalita' = 'MP12'
),
riba_a_mano as (
  select
    cc.id, cc.company_id, cc.supplier_id, cc.order_id, cc.is_paid, cc.paid_date,
    null::uuid as fattura_id, null::text as numero_fattura, null::date as data_fattura,
    cc.name as cedente_ragione_sociale,
    1 as numero_rata,
    nullif(cc.due_date, date '9999-12-31') as scadenza,
    -- lordo: è quello che addebita la banca. ?? 0 = esente (convenzione Costi)
    round(cc.amount * (1 + coalesce(cc.vat_rate, 0) / 100.0), 2) as importo,
    null::text as iban,
    1 as rate_riba_della_fattura
  from public.company_costs cc
  where cc.payment_method = 'riba'
    and not exists (
      select 1 from public.fatture_ricevute f
       where f.company_cost_id = cc.id and f.xml_raw like '%MP12%'
    )
),
tutte as (
  select * from rate_xml
  union all
  select * from riba_a_mano
)
select
  t.cost_id,
  t.company_id,
  t.supplier_id,
  coalesce(s.name, t.cedente_ragione_sociale) as fornitore,
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
  t.is_paid,
  t.paid_date,
  case
    when t.is_paid                               then 'pagata'
    when t.scadenza is null                      then 'senza_data'
    when t.scadenza < current_date               then 'passata'
    when t.scadenza <= current_date + 30         then 'in_arrivo'
    else 'futura'
  end as stato,
  case when t.scadenza is not null then t.scadenza - current_date end as giorni
from tutte t
left join public.suppliers s on s.id = t.supplier_id
left join public.orders o on o.id = t.order_id;

comment on view public.v_riba_fornitori is
  'Una riga per ogni RiBa da pagare ai fornitori: dalle rate MP12 dell''XML delle fatture (data e importo lordo della singola RiBa) o dai costi segnati RiBa a mano. Stato calcolato: pagata | passata (addebitata e non registrata, o insoluta: da verificare in banca) | in_arrivo (30 gg) | futura | senza_data.';

revoke all on public.v_riba_fornitori from public, anon;
grant select on public.v_riba_fornitori to authenticated, service_role;
