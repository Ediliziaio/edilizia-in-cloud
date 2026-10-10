// Read-only audit of the local forecast calculation against this demo tenant.
import { build } from 'esbuild';
import { C, guard, q, save, sql } from './demo-company-55m.mjs';
guard();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4));
const [{ data }] = sql(`select jsonb_build_object(
  'accounts',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select id,current_balance,balance_updated_at,currency from bank_accounts where company_id=${q(C)} and is_active)a),
  'dues',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select id,direction,description,amount,paid_amount,due_date,status,cost_id,invoice_id,order_id,notes,auto_source from scadenze where company_id=${q(C)})d),
  'payments',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (select id,direction,amount,entry_date,scadenza_id,cost_id,installment_id,invoice_id,documento_fiscale_id from prima_nota_entries where company_id=${q(C)} and entry_date<=${q(today)})p),
  'costs',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from (select id,name,amount,vat_rate,due_date,is_paid,payment_method from company_costs where company_id=${q(C)} and coalesce(is_paid,false)=false)c),
  'rates',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select r.id,r.order_id,r.label,r.amount,r.expected_date,r.is_paid,r.invoice_id,r.documento_fiscale_id from order_installments r join orders o on o.id=r.order_id where o.company_id=${q(C)} and o.deleted_at is null)r),
  'manuals',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (select id,anno,mese,tipo,descrizione,importo,ricorrente from cg_cash_flow_manuali where company_id=${q(C)} and anno=${year})m)
) data`);
const accounts = data.accounts.filter(a => a.currency === 'EUR');
if (!accounts.length || accounts.some(a => a.current_balance == null || !Number.isFinite(Number(a.current_balance)))) throw Error('Missing EUR opening bank balance');
const opening = accounts.reduce((sum, a) => sum + Number(a.current_balance), 0);
const built = await build({ entryPoints: ['src/lib/controlloGestione/projectedCashFlow.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { projectedCashFlow } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const result = projectedCashFlow({ ...data, companyId: C, today, year, opening });
let previous = Math.round(opening * 100);
for (const month of result.mesi) {
  const income = Math.round(month.entrate_totali * 100), expense = Math.round(month.uscite_totali * 100);
  if (Math.round(month.saldo_inizio * 100) !== previous || Math.round(month.saldo_fine * 100) !== previous + income - expense) throw Error('Monthly cash reconciliation failed');
  const detailIn = month.dettaglio_entrate.reduce((sum, r) => sum + Math.round(r.importo * 100), 0);
  const detailOut = month.dettaglio_uscite.reduce((sum, r) => sum + Math.round(r.importo * 100), 0);
  if (detailIn !== income || detailOut !== expense) throw Error('Cash source detail reconciliation failed');
  previous = Math.round(month.saldo_fine * 100);
}
if (result.verifiche.length !== result.meta.da_verificare || result.verifiche.some(v => !v.id || !v.motivo)) throw Error('Untraceable forecast exclusions');
save('cash-flow-forecast-verified', result);
console.log({ company: C, year, opening, closing: result.meta.saldo_chiusura,
  months: result.mesi.map(m => m.mese), excluded: result.verifiche.length,
  excludedBySource: Object.fromEntries(['scadenza', 'costo', 'rata', 'manuale'].map(source => [source, result.verifiche.filter(v => v.origine === source).length])),
  cashReconciled: true, sourceDetailsReconciled: true, remoteWrites: 0 });
