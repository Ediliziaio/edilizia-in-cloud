/** Read-only evidence across all demo flows, with an immutable recovery snapshot. */
import { C, YEAR, AS_OF, q, sql, guard, save, has } from './demo-company-2026.mjs';
guard();
const tables = ['orders','order_items','order_installments','order_employees','order_external_teams','order_work_phases','order_work_subphases','order_acceptance_reports',
  'employees','hr_profili','hr_cedolini','hr_timbrature','hr_giornate','company_costs','mezzi','mezzi_documenti','mezzi_manutenzioni','mezzi_assegnazioni','mezzi_giornate','mezzi_allocazioni','mezzi_segnalazioni',
  'warehouse_stock','warehouse_movements','appointments','documenti_fiscali','documenti_righe','prima_nota_entries','movimenti_cassa_native','campo_rapportini','purchase_orders','purchase_order_items','ddt_ricezione','fatture_ricevute','subappaltatori','contratti_subappalto','sal_subappaltatori','external_teams','scadenze','fattura_ordine', 'marketing_contacts','anagrafiche_native','tasks',
  'quotes','quote_items','invoices','invoice_lines','invoice_payments'];
const columns = sql(`select table_name,column_name,data_type,is_generated from information_schema.columns where table_schema='public' and table_name in (${tables.map(q).join(',')}) order by table_name,ordinal_position`);
const schema = Object.fromEntries(tables.map(t => [t, columns.filter(c => c.table_name === t)]));
const data = { company: C, year: YEAR, asOf: AS_OF, capturedAt: new Date().toISOString(), schema };
// Separate reads keep each statement bounded and avoid one huge JSON expression.
for (let i = 0; i < tables.length; i += 8) {
  const expressions = [];
  for (const t of tables.slice(i,i+8)) {
    const cols = schema[t];
    if (!cols.length) continue;
    const scope = cols.some(c=>c.column_name==='company_id') ? `company_id=${q(C)}`
      : cols.some(c=>c.column_name==='order_id') ? `order_id in(select id from orders where company_id=${q(C)})`
      : t==='documenti_righe' ? `documento_id in(select id from documenti_fiscali where company_id=${q(C)})`
      : t==='quote_items' ? `quote_id in(select id from quotes where company_id=${q(C)})`
      : t==='invoice_lines' ? `invoice_id in(select id from invoices where company_id=${q(C)})`
      : t==='order_work_subphases' ? `phase_id in(select id from order_work_phases where company_id=${q(C)})` : null;
    if(scope) expressions.push(`${q(t)},(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select * from public.${t} where ${scope})r)`);
  }
  if(expressions.length) Object.assign(data, sql(`select jsonb_build_object(${expressions.join(',')}) data`)[0].data);
  console.log(`Read-only audit ${Math.min(i+8,tables.length)}/${tables.length}`);
}
data.deadlines = sql(`select * from mezzi_scadenze where company_id=${q(C)}`);
data.viewDefinition = sql(`select pg_get_viewdef('public.mezzi_scadenze'::regclass,true) definition`)[0].definition;
if (!has('before')) save('before', data, true);
save('audit-latest', data);
const monthly = (rows,field,amount) => {
  const result = Object.fromEntries(Array.from({length:12},(_,i)=>[`${YEAR}-${String(i+1).padStart(2,'0')}`,{count:0,amount:0}]));
  for(const r of rows ?? []) { const m=String(r[field]??'').slice(0,7); if(result[m]) {result[m].count++;if(amount)result[m].amount+=Number(r[amount]??0);} }
  return result;
};
const active = data.orders.filter(o=>!o.deleted_at);
const report = {
  company:C,year:YEAR,asOf:AS_OF,counts:Object.fromEntries(tables.filter(t=>Array.isArray(data[t])).map(t=>[t,data[t].length])),
  orderDateFields:schema.orders.filter(c=>c.data_type.includes('date')||c.data_type.includes('timestamp')).map(c=>c.column_name),
  fleetExpired:data.deadlines.filter(d=>d.stato==='scaduto').map(d=>({asset:d.mezzo_nome,source:d.origine,category:d.categoria,due:d.data_scadenza})),
  fleetUpcoming:data.deadlines.filter(d=>d.stato==='in_scadenza').map(d=>({asset:d.mezzo_nome,category:d.categoria,due:d.data_scadenza})),
  activeOrdersByCreation:monthly(active,'created_at','total_amount'),
  temporalFields:Object.fromEntries(tables.map(t=>[t,schema[t].filter(c=>c.data_type==='date'||c.data_type.startsWith('timestamp')).map(c=>c.column_name)])),
};
save('audit-report',report);
console.log(JSON.stringify({company:C,year:YEAR,asOf:AS_OF,counts:report.counts,fleetExpired:report.fleetExpired,fleetUpcoming:report.fleetUpcoming},null,2));
