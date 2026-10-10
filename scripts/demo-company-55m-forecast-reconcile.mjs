/** Retire four obsolete unpaid demo fixtures, retaining their recoverable history.
 * No invoices, cash receipts, bank transactions or contract amounts are modified.
 */
import { existsSync } from 'node:fs';
import { C, MARK, q, sql, read, save, guard } from './demo-company-55m.mjs';
guard();
if (existsSync('tmp/demo-integrated/annual-55m/forecast-reconcile-applied.json')) throw Error('Applied plan immutable');
const ids = ['017ea7d6-f194-3823-404c-a66206e9488e', 'b52b689e-d390-7155-720c-0d36d7d3b9ae',
  '0bc34821-ece7-7ef1-b3b1-03f4c1e21c3d', '47dd4c06-c17b-d0b5-ac9c-291bd187edbe'];
const old = read('before').scadenze.filter(d => ids.includes(d.id));
const current = sql(`select to_jsonb(s) data from scadenze s where company_id=${q(C)} and id in (${ids.map(q).join(',')}) order by id`).map(r => r.data);
if (old.length !== 4 || current.length !== 4 || current.some(d => Object.keys(d).some(k => JSON.stringify(d[k]) !== JSON.stringify(old.find(o => o.id === d.id)?.[k])))) {
  throw Error('Legacy fixture differs from the original snapshot; manual review required');
}
save('forecast-reconcile-before', current);
const tables = ['orders', 'documenti_fiscali', 'prima_nota_entries', 'bank_accounts', 'bank_transactions', 'company_costs'];
const fingerprints = tables.map(t => `${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb)::text) from ${t} r where company_id=${q(C)})`).join(',');
const statements = [`create temporary table demo_forecast_financial_guard on commit drop as select jsonb_build_object(${fingerprints}) fingerprint;`];
for (const d of current) {
  if (d.status !== 'da_pagare' || Number(d.paid_amount) || d.invoice_id || d.auto_source || d.prima_nota_entry_id || d.paid_date) throw Error('Not an untouched unpaid fixture');
  statements.push(`do $$begin
    if exists(select 1 from prima_nota_entries where scadenza_id=${q(d.id)})
      or exists(select 1 from bank_transactions where linked_scadenza_id=${q(d.id)})
      or exists(select 1 from bank_payments where scadenza_id=${q(d.id)})
      or exists(select 1 from bank_reconciliations where scadenza_id=${q(d.id)})
      or exists(select 1 from tickets where scadenza_id=${q(d.id)})
      or exists(select 1 from email_scadenza_bozza where scadenza_creata_id=${q(d.id)})
    then raise exception 'Legacy due has an active dependent record';end if;
    if not exists(select 1 from orders o where o.company_id=${q(C)} and o.id=${q(d.order_id)} and o.deleted_at is null
      and abs((select sum(amount) from order_installments where order_id=o.id)-
        (o.total_amount+coalesce((select sum(impatto_economico) from ordini_variazione where order_id=o.id and status='approvato'),0))*(1+o.vat_rate/100.0))<0.02
      and exists(select 1 from order_installments r join documenti_fiscali f on f.id=r.documento_fiscale_id
        where r.order_id=o.id and f.ordine_id=o.id and f.company_id=${q(C)} and f.stato not in('bozza','annullata')))
    then raise exception 'Current gross payment plan is not proven';end if;
    update scadenze set status='annullata',notes=${q(MARK+' Scadenza demo originaria sostituita dal piano rate lordo IVA della commessa; storico conservato, nessun incasso modificato.')}
      where company_id=${q(C)} and id=${q(d.id)} and order_id=${q(d.order_id)} and amount=${d.amount}
      and status='da_pagare' and coalesce(paid_amount,0)=0 and invoice_id is null and notes is null
      and updated_at=${q(d.updated_at)}::timestamptz;
    if not found then raise exception 'Fixture changed concurrently';end if;
  end $$;`);
}
statements.push(`do $$begin if (select fingerprint from demo_forecast_financial_guard) is distinct from jsonb_build_object(${fingerprints}) then raise exception 'Financial records changed';end if;end $$;`);
save('forecast-reconcile-plan', { company: C, marker: MARK, batches: [statements] });
console.log({ company: C, obsoleteUnpaidDues: 4, retainedPaidHistory: true, financialWrites: 0 });
