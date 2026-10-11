/** Demo Azienda 2 only. Explicit fiscal years; immutable backups and rollback gates. */
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {C,A,q,j,sql,guard,context,insert} from './demo-company-55m.mjs';
export {C,A,q,j,sql,guard,context,insert};
export const YEAR=Number(process.argv[2]);
// 2024 is an explicit new demo year. Its intermediate turnover is a scenario
// assumption, not an amount retrieved from accounting or an actual invoice.
export const TARGETS={2023:2800000,2024:3600000,2025:4700000,2026:5500000};
if(!TARGETS[YEAR])throw Error('Only explicitly requested demo years: 2023, 2024, 2025, 2026');
export const AS_OF='2026-10-10',MARK=`[DEMO HISTORY ${YEAR} v1]`,DIR=`tmp/demo-integrated/history-${YEAR}`;
mkdirSync(DIR,{recursive:true,mode:0o700});
export const uid=key=>{const h=createHash('sha256').update(`${MARK}:${key}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const has=name=>existsSync(`${DIR}/${name}.json.gz`);
export const read=name=>JSON.parse(gunzipSync(readFileSync(`${DIR}/${name}.json.gz`)));
export const save=(name,value,immutable=false)=>{if(immutable&&has(name))throw Error('Preserve '+name);writeFileSync(`${DIR}/${name}.json.gz`,gzipSync(JSON.stringify(value)),{mode:0o600});};
export const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export const add=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const stamp=(date,h='16:00:00')=>date+'T'+h+(new Intl.DateTimeFormat('en',{timeZone:'Europe/Rome',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value==='GMT+2'?'+02:00':'+01:00');
export const working=date=>![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())&&!['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(date.slice(5))&&!['2023-04-10','2024-04-01','2025-04-21','2026-04-06'].includes(date)&&!(date.slice(5)>='08-11'&&date.slice(5)<='08-22')&&date.slice(5)<'12-24';
export function plan(stage,batches,manifest){
  if(has(stage+'-applied'))throw Error('Applied plan is immutable');
  save(stage+'-plan',{company:C,year:YEAR,asOf:AS_OF,marker:MARK,batches});
  if(manifest)save(stage+'-manifest',manifest);
  console.log(JSON.stringify({year:YEAR,stage,batches:batches.length,statements:batches.flat().length}));
}
export function run(stage,dry){
  guard();if(!has('before'))throw Error('Immutable tenant/year archive required');const p=read(stage+'-plan'),hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  if(p.company!==C||p.year!==YEAR||p.asOf!==AS_OF)throw Error('Tenant/year/date mismatch');
  if(!dry&&(!has(stage+'-dry')||read(stage+'-dry').hash!==hash||read(stage+'-dry').completed.length!==p.batches.length))throw Error('Full matching rollback run required');
  const name=stage+(dry?'-dry':'-applied');let checkpoint=has(name)?read(name):{company:C,year:YEAR,hash,completed:[]};
  if(checkpoint.hash!==hash){if(!dry)throw Error('Plan changed');save(name+'-'+checkpoint.hash.slice(0,12),checkpoint);checkpoint={company:C,year:YEAR,hash,completed:[]};}
  for(const [index]of p.batches.entries()){
    if(checkpoint.completed.includes(index))continue;
    const group=Array.from({length:['business','attendance','structure','warehouse','customers'].includes(stage)?4:['chat','documents','vendors','products'].includes(stage)?8:1},(_,i)=>i+index).filter(i=>i<p.batches.length&&!checkpoint.completed.includes(i));
    sql(`begin;${context}${group.flatMap(i=>p.batches[i]).join('\n')}
      delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
      delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
      ${dry?'rollback':'commit'};`);
    checkpoint.completed.push(...group);save(name,checkpoint);console.log(`${dry?'ROLLBACK':'APPLIED'} ${YEAR} ${stage} ${group.at(-1)+1}/${p.batches.length}`);
  }
}
export function capture(){
  guard();
  const tables=['orders','order_items','order_installments','order_employees','order_external_teams','order_work_phases','order_work_subphases','order_acceptance_reports','employees','hr_profili','hr_cedolini','hr_timbrature','hr_giornate','company_costs','mezzi','mezzi_documenti','mezzi_manutenzioni','mezzi_assegnazioni','mezzi_giornate','warehouse_stock','warehouse_movements','warehouses','appointments','marketing_calendars','documenti_fiscali','prima_nota_entries','movimenti_cassa_native','campo_rapportini','purchase_orders','purchase_order_items','ddt_ricezione','fatture_ricevute','subappaltatori','contratti_subappalto','sal_subappaltatori','external_teams','scadenze','fattura_ordine','marketing_contacts','anagrafiche_native','tasks','quotes','quote_items','invoices','invoice_lines','invoice_payments','suppliers','order_statuses','sal_records','sal_voci','internal_chat_channels','internal_chat_members','internal_chat_messages','bank_accounts','bank_transactions'];
  const cols=sql(`select table_name,column_name,data_type,is_generated from information_schema.columns where table_schema='public' and table_name in(${tables.map(q)}) order by table_name,ordinal_position`);
  const data={company:C,year:YEAR,asOf:AS_OF,schema:Object.fromEntries(tables.map(t=>[t,cols.filter(c=>c.table_name===t)]))};
  for(let i=0;i<tables.length;i+=6){const parts=[];
    for(const t of tables.slice(i,i+6)){const cs=data.schema[t];
      const scope=cs.some(c=>c.column_name==='company_id')?`company_id=${q(C)}`:cs.some(c=>c.column_name==='order_id')?`order_id in(select id from orders where company_id=${q(C)})`:t==='quote_items'?`quote_id in(select id from quotes where company_id=${q(C)})`:t==='invoice_lines'?`invoice_id in(select id from invoices where company_id=${q(C)})`:t==='order_work_subphases'?`phase_id in(select id from order_work_phases where company_id=${q(C)})`:t==='sal_voci'?`sal_id in(select id from sal_records where company_id=${q(C)})`:null;
      if(scope)parts.push(`${q(t)},(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from(select * from public.${t} where ${scope})x)`);
    }if(parts.length)Object.assign(data,sql(`select jsonb_build_object(${parts}) data`)[0].data);console.log(`READ ${YEAR} ${Math.min(i+6,tables.length)}/${tables.length}`);
  }
  data.members=sql(`select p.id user_id,r.role from profiles p join user_roles r on r.user_id=p.id where p.company_id=${q(C)}`);
  data.sites=sql(`select id from sedi where company_id=${q(C)}`);
  data.chatTriggers=sql(`select tgname,pg_get_triggerdef(t.oid) definition,pg_get_functiondef(tgfoid) body from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in('internal_chat_messages','internal_chat_channels') and not t.tgisinternal`);
  if(!has('before'))save('before',data,true);save('latest',data);
}
if(process.argv[1]?.endsWith('demo-company-history.mjs')){
  const mode=process.argv[3];if(mode==='capture')capture();else if(['dry','apply'].includes(mode))run(process.argv[4],mode==='dry');
}
