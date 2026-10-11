/** Entire Demo Azienda 2 accounting graph, not just the new seeded jobs. */
import {mkdirSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {C,A,q,j,sql,guard,context,insert} from './demo-company-55m.mjs';
export {C,A,q,j,sql,guard,context,insert};
export const DIR='tmp/demo-integrated/accounting-2026-10-10',MARK='[DEMO ACCOUNTING AUDIT 2026-10-10]',AS_OF='2026-10-10';
mkdirSync(DIR,{recursive:true,mode:0o700});
export const read=name=>JSON.parse(gunzipSync(readFileSync(`${DIR}/${name}.json.gz`)));
export const has=name=>existsSync(`${DIR}/${name}.json.gz`);
export const save=(name,value,immutable=false)=>{if(immutable&&has(name))throw Error('Preserve '+name);writeFileSync(`${DIR}/${name}.json.gz`,gzipSync(JSON.stringify(value)),{mode:0o600});};
const tables=['orders','order_items','order_installments','order_employees','order_external_teams','order_errors','order_salespeople','company_costs','documenti_fiscali','invoices','invoice_payments','invoice_lines','movimenti_cassa_native','prima_nota_entries','bank_accounts','bank_transactions','bank_reconciliations','fatture_ricevute','fattura_ordine','purchase_orders','purchase_order_items','ddt_ricezione','scadenze','suppliers','anagrafiche_native','marketing_contacts','profiles','sal_records','sal_voci','sal_subappaltatori','cg_classificazione_voci','cedolini','hr_cedolini','cespiti','patrimonio_netto','cg_loans','ce_riclassificato_overrides','cg_cash_flow_manuali','v_cg_costi_classificati','v_cg_ricavi_classificati','v_ordine_marginalita'];
export function capture(){
 guard();
 const cols=sql(`select table_name,column_name,data_type,is_generated from information_schema.columns where table_schema='public' and table_name in(${tables.map(q)}) order by table_name,ordinal_position`);
 const snapshot={company:C,asOf:AS_OF,capturedAt:new Date().toISOString(),schema:Object.fromEntries(tables.map(t=>[t,cols.filter(c=>c.table_name===t)]))};
 for(let i=0;i<tables.length;i+=5){const parts=[];
  for(const t of tables.slice(i,i+5)){const cs=snapshot.schema[t];
   const scope=cs.some(c=>c.column_name==='company_id')?`company_id=${q(C)}`:cs.some(c=>c.column_name==='order_id')?`order_id in(select id from orders where company_id=${q(C)})`:t==='invoice_lines'?`invoice_id in(select id from invoices where company_id=${q(C)})`:t==='sal_voci'?`sal_id in(select id from sal_records where company_id=${q(C)})`:null;
   if(scope)parts.push(`${q(t)},(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from(select * from public.${t} where ${scope})x)`);
  }
  if(parts.length)Object.assign(snapshot,sql(`select jsonb_build_object(${parts}) data`)[0].data);
  console.log(`ACCOUNTING READ ${Math.min(i+5,tables.length)}/${tables.length}`);
 }
 if(!has('before'))save('before',snapshot,true);save('latest',snapshot);
 console.log(JSON.stringify({company:C,counts:Object.fromEntries(tables.map(t=>[t,snapshot[t]?.length||0]))}));
}
if(process.argv[1]?.endsWith('demo-company-accounting-audit.mjs'))capture();
