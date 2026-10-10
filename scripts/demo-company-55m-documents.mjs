/** Saved-source PDFs, privately stored, unsigned and explicitly synthetic. */
import {C,A,MARK,DIR,uid,q,read,save,sql,guard,context} from './demo-company-55m.mjs';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
const mode=process.argv[2]||'preview';if(!['preview','apply'].includes(mode))throw Error('Unsupported mode');
guard();const d=read('after'),ids=new Set(read('business-manifest').orders.map(o=>o.id)),orders=d.orders.filter(o=>ids.has(o.id)),hash=b=>createHash('sha256').update(b).digest('hex');
if(orders.length!==48)throw Error('Incomplete saved jobs');
const buckets=sql(`select id,public from storage.buckets where id in('campo-rapportini','order-acceptance-reports','order-attachments')`);
if(buckets.length!==3||buckets.some(b=>b.public))throw Error('Private document storage required');
const require=createRequire(import.meta.url);mkdirSync(DIR+'/pdfs',{recursive:true,mode:0o700});
await build({entryPoints:['supabase/functions/genera-pdf-rapportino/render.ts','supabase/functions/collaudo-commessa/render.ts'],outbase:'supabase/functions',outdir:DIR+'/renderers',bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'deno-pdf',setup(b){b.onResolve({filter:/^https:\/\/esm.sh\/pdf-lib/},()=>({path:require.resolve('pdf-lib')}));}}]});
const {renderRapportino}=await import(pathToFileURL(resolve(DIR+'/renderers/genera-pdf-rapportino/render.mjs'))),{renderAcceptance}=await import(pathToFileURL(resolve(DIR+'/renderers/collaudo-commessa/render.mjs')));
let admin;if(mode==='apply'){const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Missing storage authorization');admin=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});}
async function upload(bucket,path,bytes){if(!(path.startsWith(C+'/')||bucket==='order-attachments'&&path.startsWith('orders/')))throw Error('Unscoped document');const {error}=await admin.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error){const {data,error:err}=await admin.storage.from(bucket).download(path);if(err||hash(new Uint8Array(await data.arrayBuffer()))!==hash(bytes))throw Error('Storage document conflict');}}
const audit=[],folder=uid('documents-folder');
for(const order of orders.filter((_,i)=>mode==='apply'||i<3)){
  const reports=d.campo_rapportini.filter(p=>p.order_id===order.id).sort((a,b)=>a.data_lavoro.localeCompare(b.data_lavoro)),acceptance=d.order_acceptance_reports.find(a=>a.order_id===order.id),merged=await PDFDocument.create(),updates=[],tasks=[];
  if(!acceptance||!reports.length)throw Error('Missing saved sources');
  for(const report of reports){
    const result=await renderRapportino({report:{...report,ordine:order,autore:{first_name:'Simulazione',last_name:'DEMO - nessun autore reale'}},company:{name:'Demo Azienda 2 S.r.l.'},branding:{primaryColor:'#193E68'},phases:d.order_work_phases.filter(p=>p.order_id===order.id),punches:[],warnings:[],revision:'DEMO55-2025',generatedAt:'2026-10-09T20:00:00Z'},async()=>null);
    if(result.warnings.length)throw Error('Renderer missing source content');
    const digest=hash(result.bytes),path=`${C}/${order.id}/${report.id}/demo-${digest.slice(0,16)}.pdf`,file=DIR+'/pdfs/report-'+report.id+'.pdf';writeFileSync(file,result.bytes,{mode:0o600});
    const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!text.includes(order.order_code)||!text.includes('DEMO')||!(text.includes('COSA È STATO FATTO')||text.includes('Lavori eseguiti')))throw Error('Report missing essential data');
    const doc=await PDFDocument.load(result.bytes),pages=await merged.copyPages(doc,doc.getPageIndices());pages.forEach(p=>merged.addPage(p));
    if(admin){tasks.push(()=>upload('campo-rapportini',path,result.bytes));updates.push(`update campo_rapportini set pdf_url=${q(admin.storage.from('campo-rapportini').getPublicUrl(path).data.publicUrl)} where id=${q(report.id)} and company_id=${q(C)} and updated_at=${q(report.updated_at)};`);}
  }
  const bundle=await merged.save(),bundlePath=`orders/${order.id}/demo-55m/rapportini-${hash(bundle).slice(0,16)}.pdf`,bundleFile=DIR+'/pdfs/'+order.order_code+'-rapportini.pdf';writeFileSync(bundleFile,bundle,{mode:0o600});
  const ar=await renderAcceptance(acceptance.content,{company:'Demo Azienda 2 S.r.l.',order:order.order_code,address:order.work_address||'',id:acceptance.id,version:acceptance.version}),ad=hash(ar.bytes),ap=`${C}/${order.id}/${acceptance.id}/demo-${ad.slice(0,16)}.pdf`,af=DIR+'/pdfs/'+order.order_code+'-collaudo.pdf';writeFileSync(af,ar.bytes,{mode:0o600});
  const text=execFileSync('pdftotext',['-layout',af,'-'],{encoding:'utf8'});if(!text.includes('EDIZIONE NON FIRMATA')||!text.includes(order.order_code))throw Error('Unsigned acceptance provenance missing');
  if(admin){
    tasks.push(()=>upload('order-attachments',bundlePath,bundle));tasks.push(()=>upload('order-acceptance-reports',ap,ar.bytes));const aa=`orders/${order.id}/demo-55m/collaudo-${ad.slice(0,16)}.pdf`;tasks.push(()=>upload('order-attachments',aa,ar.bytes));
    for(let start=0;start<tasks.length;start+=4)await Promise.all(tasks.slice(start,start+4).map(f=>f()));
    sql(`begin;${context}insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values(${q(folder)},${q(C)},'DEMO · Rapportini e collaudi',10,false,${q(A)}) on conflict(id) do nothing;
      ${updates.join('\n')}
      update order_acceptance_reports set pdf_path=${q(ap)},document_hash=${q(ad)} where id=${q(acceptance.id)} and company_id=${q(C)} and status='draft' and version=${acceptance.version};
      insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) values(${q(uid('report-bundle-'+order.id))},${q(order.id)},${q('DEMO - Tutti i rapportini - '+order.order_code+'.pdf')},${q(bundlePath)},'application/pdf',${bundle.length},${q(A)},${q(folder)},false),(${q(uid('acceptance-attachment-'+order.id))},${q(order.id)},${q('DEMO - Collaudo non firmato - '+order.order_code+'.pdf')},${q(aa)},'application/pdf',${ar.bytes.length},${q(A)},${q(folder)},false) on conflict(id) do nothing;
      do $$begin if (select count(*) from campo_rapportini where company_id=${q(C)} and order_id=${q(order.id)} and pdf_url is not null)<>${reports.length} then raise exception 'Incomplete report PDFs';end if;end $$;
      delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp();delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp();commit;`);
    for(const [bucket,path,bytes]of [['order-attachments',bundlePath,bundle],['order-acceptance-reports',ap,ar.bytes]]){const {data,error}=await admin.storage.from(bucket).download(path);if(error||hash(new Uint8Array(await data.arrayBuffer()))!==hash(bytes))throw Error('Saved document verification failed');}
  }
  audit.push({order:order.id,code:order.order_code,reports:reports.length,pages:merged.getPageCount(),bundle:bundleFile,acceptance:af,uploaded:!!admin});save('documents-'+mode,audit);console.log(mode.toUpperCase(),order.order_code,'reports='+reports.length,'pages='+merged.getPageCount());
}
console.log({jobs:audit.length,reports:audit.reduce((s,j)=>s+j.reports,0),unsignedAcceptances:audit.length,outboundSends:0});
