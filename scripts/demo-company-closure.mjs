/** Recoverable, tenant-only closure. This script never sends or pays anything. */
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {C,A,q,j,sql,guard,context,insert,read as auditRead} from './demo-company-accounting-audit.mjs';
export {C,A,q,j,sql,guard,context,insert};
export const DIR='tmp/demo-integrated/closure-2026-10-11',MARK='[DEMO CLOSURE 2026-10-11 v1]';
mkdirSync(DIR,{recursive:true,mode:0o700});
export const has=n=>existsSync(`${DIR}/${n}.json.gz`);
export const read=n=>JSON.parse(gunzipSync(readFileSync(`${DIR}/${n}.json.gz`)));
export const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const save=(n,v,immutable=false)=>{if(immutable&&has(n))throw Error('Preserve archive '+n);writeFileSync(`${DIR}/${n}.json.gz`,gzipSync(JSON.stringify(v)),{mode:0o600});};
export const cents=x=>Math.round(Number(x||0)*100);
export const uid=k=>{const h=sha(MARK+'|'+k);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const queues=`delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;`;
export function financialSignature(s){return Object.fromEntries(['documenti_fiscali','invoices','company_costs','fatture_ricevute','v_cg_costi_classificati','v_ordine_marginalita'].map(t=>[t,sha(s[t].map(({updated_at,pdf_url,...x})=>x).sort((a,b)=>String(a.id).localeCompare(String(b.id))))]));}
export async function serviceClient(){
 const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('No authorized project service credential');
 return createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(120000)})}});
}
async function backup(){
 guard();if(has('archive')){const a=read('archive');console.log({archive:'already preserved',tables:a.tables,rows:a.rows});return;}
 let data,error;
 if(!has('archive-parts')){const client=await serviceClient();({data,error}=await client.rpc('admin_esporta_azienda',{p_company_id:C}));}
 if(has('archive-parts')||error?.message.includes('statement timeout')){
  // Use the same server-owned tenant catalog, read-only in small batches.
  // Do not change server timeout settings or impersonate a super-admin.
  const catalog=sql('select * from admin_catalogo_backup()');
  const parts=has('archive-parts')?read('archive-parts'):{company:C,at:new Date().toISOString(),tables:{},completed:[]};
  for(let i=0;i<catalog.length;i+=20){
   const group=catalog.slice(i,i+20).filter(x=>!parts.completed.includes(x.tabella));if(!group.length)continue;
   if(group.some(x=>!/^\w+$/.test(x.tabella)||!x.filtro.includes('$1')))throw Error('Unexpected archive catalog');
   const pairs=group.map(x=>`${q(x.tabella)},(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${x.tabella} t where ${x.filtro.replaceAll('$1',q(C)+'::uuid')})`);
   Object.assign(parts.tables,sql(`select jsonb_build_object(${pairs}) data`)[0].data);
   parts.completed.push(...group.map(x=>x.tabella));save('archive-parts',parts);
   if(i%100===0||i+20>=catalog.length)console.log(`Archive read ${parts.completed.length}/${catalog.length}`);
  }
  if(parts.completed.length!==catalog.length)throw Error('Incomplete archive catalog');
  data={azienda:sql(`select to_jsonb(c) row from companies c where id=${q(C)}`)[0].row,...parts.tables,esportato_il:parts.at,elenco_da_catalogo:true,tabelle_incluse:catalog.length,righe_totali:Object.values(parts.tables).reduce((n,r)=>n+r.length,0),capture_mode:'read-only catalog batches'};error=null;
 }
 if(error)throw Error('Company archive failed: '+error.message);
 if(!data||data.azienda?.id!==C||Object.keys(data).some(k=>k.endsWith('__errore')))throw Error('Incomplete or wrong-tenant archive');
 save('company-before',data,true);save('finance-before',auditRead('latest'),true);
 const physical=sql(`select jsonb_build_object('warehouse_stock',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from warehouse_stock s where company_id=${q(C)}),'warehouse_movements',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from warehouse_movements m where company_id=${q(C)})) data`)[0].data;
 save('physical-before',physical,true);
 const manifest={company:C,at:new Date().toISOString(),companySHA:sha(data),financeSHA:sha(read('finance-before')),physicalSHA:sha(physical),tables:data.tabelle_incluse,rows:data.righe_totali,storage:'Old private objects are retained; database export contains references, not their bytes.'};
 save('archive',manifest,true);console.log({archive:'verified',tables:manifest.tables,rows:manifest.rows});
}
export function run(stage,mode){
 guard();if(!has('archive'))throw Error('Verified archive required');
 const p=read(stage+'-plan'),hash=sha(p);if(p.company!==C||!['dry','apply'].includes(mode))throw Error('Invalid plan/operation');
 if(mode==='apply'&&(!has(stage+'-dry')||read(stage+'-dry').hash!==hash||read(stage+'-dry').completed.length!==p.batches.length))throw Error('Matching, complete rollback rehearsal required');
 const key=stage+'-'+mode,log=has(key)?read(key):{company:C,hash,completed:[]};if(log.hash!==hash)throw Error('Plan changed');
 for(let i=0;i<p.batches.length;i++){
  if(log.completed.includes(i))continue;
  sql(`begin;${context}${p.batches[i].join('\n')}${queues}${mode==='dry'?'rollback':'commit'};`);
  log.completed.push(i);save(key,log);console.log(`${mode} ${stage} ${i+1}/${p.batches.length}`);
 }
}
if(process.argv[1]?.endsWith('demo-company-closure.mjs')){
 if(process.argv[2]==='backup')await backup();else if(['dry','apply'].includes(process.argv[2]))run(process.argv[3],process.argv[2]);else console.log('backup | dry STAGE | apply STAGE');
}
