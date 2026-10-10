/** Generate real downloadable DEMO reports from saved data, not invented editions.
 * Does not sign, finalize, transmit, message, or overwrite any existing file.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const C='d2000000-0000-4000-a000-000000000002',ACTOR='e592255e-0c82-86cd-7f7b-d3046317f9cd',DIR='tmp/demo-integrated';
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=key=>{const h=hash(key);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const query=sql=>JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8',maxBuffer:30*1024*1024,stdio:['ignore','pipe','pipe']})).rows;
const save=(name,data)=>writeFileSync(`${DIR}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600});
const require=createRequire(import.meta.url),mode=process.argv[2]||'preview';
if(!['preview','apply'].includes(mode))throw Error('Unsupported operation');
const preflight=query(`select (select name from companies where id=${quote(C)}) name,(select count(*) from internal_automation_flows where company_id=${quote(C)} and status='published') flows,(select count(*) from automations where company_id=${quote(C)} and is_active) automations,(select count(*) from storage.buckets where id in ('campo-rapportini','order-acceptance-reports','order-attachments') and not public) private_buckets`)[0];
if(preflight.name!=='Demo Azienda 2 S.r.l.'||Number(preflight.flows)||Number(preflight.automations)||Number(preflight.private_buckets)!==3)throw Error('Unsafe demo document preflight');
const d=JSON.parse(readFileSync(`${DIR}/after.json`));if(d.company!==C)throw Error('Wrong snapshot');
mkdirSync(`${DIR}/pdfs`,{recursive:true,mode:0o700});
await build({entryPoints:['supabase/functions/genera-pdf-rapportino/render.ts','supabase/functions/collaudo-commessa/render.ts'],outbase:'supabase/functions',outdir:`${DIR}/renderers`,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'deno-pdf',setup(b){b.onResolve({filter:/^https:\/\/esm.sh\/pdf-lib/},()=>({path:require.resolve('pdf-lib')}));}}]});
const {renderRapportino}=await import(pathToFileURL(resolve(`${DIR}/renderers/genera-pdf-rapportino/render.mjs`)));
const {renderAcceptance}=await import(pathToFileURL(resolve(`${DIR}/renderers/collaudo-commessa/render.mjs`)));
let admin;
if(mode==='apply'){
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Admin credential unavailable');
  admin=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
}
const audit=[];
const folders={report:{id:uuid('demo-integrated-report-folder'),name:'Rapportini di cantiere',position:8},acceptance:{id:uuid('demo-integrated-acceptance-folder'),name:'Collaudi e consegna',position:9}};
async function store(bucket,path,bytes){
  if(!path.startsWith(C+'/')&&!(bucket==='order-attachments'&&path.startsWith('orders/')))throw Error('Unscoped storage path');
  const {error}=await admin.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(error){const {data,error:downloadError}=await admin.storage.from(bucket).download(path);if(downloadError||!data||hash(new Uint8Array(await data.arrayBuffer()))!==hash(bytes))throw Error('Cannot save or verify document: '+bucket);}
}
async function edition(kind,row,order,result){
  const digest=hash(result.bytes),file=`${kind}-${row.id}-${digest.slice(0,12)}.pdf`,local=`${DIR}/pdfs/${file}`;
  writeFileSync(local,result.bytes,{mode:0o600});
  const text=execFileSync('pdftotext',['-layout',local,'-'],{encoding:'utf8'});
  if(!text.includes('DEMO')||!text.includes(order.order_code))throw Error('Document lacks demo provenance or correct job');
  if(kind==='acceptance'&&!text.includes('EDIZIONE NON FIRMATA'))throw Error('Acceptance must remain unsigned');
  if(kind==='report'&&!text.includes('Lavori eseguiti'))throw Error('Missing operational content');
  const bucket=kind==='report'?'campo-rapportini':'order-acceptance-reports';
  const path=`${C}/${order.id}/${row.id}/demo-${digest.slice(0,16)}.pdf`;
  const attach=`orders/${order.id}/demo-integrated/${file}`;
  if(admin){
    await store(bucket,path,result.bytes);await store('order-attachments',attach,result.bytes);
    const folder=folders[kind],attachmentId=uuid('demo-integrated-attachment-'+digest+'-'+row.id);
    const update=kind==='report'?`update campo_rapportini set pdf_url=${quote(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)} where id=${quote(row.id)} and company_id=${quote(C)} and updated_at=${quote(row.updated_at)};`:
      `update order_acceptance_reports set pdf_path=${quote(path)},document_hash=${quote(digest)} where id=${quote(row.id)} and company_id=${quote(C)} and status='draft' and version=${row.version};`;
    const sql=`begin;set local lock_timeout='3s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
      do $$ begin if not exists(select 1 from orders where id=${quote(order.id)} and company_id=${quote(C)}) or exists(select 1 from internal_automation_flows where company_id=${quote(C)} and status='published') or exists(select 1 from automations where company_id=${quote(C)} and is_active) then raise exception 'Unsafe document write';end if;end $$;
      insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values (${quote(folder.id)},${quote(C)},${quote(folder.name)},${folder.position},false,${quote(ACTOR)}) on conflict(id) do nothing;
      ${update}
      do $$ begin if not exists(select 1 from ${kind==='report'?'campo_rapportini':'order_acceptance_reports'} where id=${quote(row.id)} and company_id=${quote(C)} and ${kind==='report'?`pdf_url like ${quote('%'+path)}`:`pdf_path=${quote(path)}`}) then raise exception 'Document source changed; refresh snapshot';end if;end $$;
      insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) values (${quote(attachmentId)},${quote(order.id)},${quote('DEMO - '+(kind==='report'?'Rapportino':'Collaudo')+' - '+order.order_code+'.pdf')},${quote(attach)},'application/pdf',${result.bytes.length},${quote(ACTOR)},${quote(folder.id)},false) on conflict(id) do nothing;
      delete from automation_trigger_events where company_id=${quote(C)} and created_at>=transaction_timestamp() and entity_id in (${quote(order.id)},${quote(row.id)},${quote(attachmentId)});
      delete from wa_notifiche_event_queue where company_id=${quote(C)} and created_at>=transaction_timestamp() and subject_id in (${quote(order.id)},${quote(row.id)},${quote(attachmentId)});
      select 'document-linked' as result;commit;`;
    query(sql);
    const {data,error}=await admin.storage.from(bucket).download(path);if(error||hash(new Uint8Array(await data.arrayBuffer()))!==digest)throw Error('Uploaded bytes mismatch');
  }
  audit.push({kind,order:order.id,id:row.id,hash:digest,pages:result.pageCount||result.pages,path:local,uploaded:!!admin});save(`documents-${mode}`,audit);console.log(`${mode.toUpperCase()} ${kind} ${order.order_code}`);
}
for(const order of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0)){
  const report=d.campo_rapportini.filter(r=>r.order_id===order.id).sort((x,y)=>y.data_lavoro.localeCompare(x.data_lavoro))[0];
  if(report){
    const autore=d.profiles.find(p=>p.id===report.user_id)||null;
    const result=await renderRapportino({report:{...report,ordine:order,autore},company:{name:'Demo Azienda 2 S.r.l.'},branding:{primaryColor:'#193E68'},phases:d.order_work_phases.filter(p=>p.order_id===order.id),punches:[],warnings:[],revision:'DEMO-INTEGRATA-2026-10',generatedAt:'2026-10-09T19:00:00Z'},async(ref,kind)=>{
      if(kind!=='photo')return null;
      const map={'1778464d-0839-4011-a3f8-d267f7c9120f':'int','d1d16e2e-437a-42eb-a7a0-60c38c22dfbe':'mix','b20edd88-6b86-4024-af24-1b1b2a4b2674':'sub'};
      const match=/demo-cfo-(prima|lavori|finale)\.jpg/.exec(ref),key=map[order.id];
      const p=match&&key?`work/demo-cfo/${key}-${match[1]}.jpg`:null;return p&&existsSync(p)?new Uint8Array(readFileSync(p)):null;
    });
    if(result.warnings.length)throw Error('Work photo could not render');
    await edition('report',report,order,result);
  }
  for(const row of d.order_acceptance_reports.filter(r=>r.order_id===order.id&&r.status==='draft'&&!r.pdf_path)){
    const result=await renderAcceptance(row.content,{company:'Demo Azienda 2 S.r.l.',order:order.order_code,address:order.work_address||order.indirizzo_lavori||'',id:row.id,version:row.version});
    await edition('acceptance',row,order,result);
  }
}
console.log({documents:audit.length,uploaded:!!admin,signed:0,externalSends:0});
