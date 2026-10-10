/** Regenerate operational documents from prospective source rows before applying the demo plan. */
import {C,A,DIR,q,read,save,sql,guard,uid} from './demo-company-55m.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
const mode=process.argv[2]??'preview';if(!['preview','prepare','upload'].includes(mode))throw Error('Unsupported mode');
guard();const sources=read('physical-operations-sources'),before=read('operations-before'),d=read('after'),jobs=read('business-manifest').orders;
const hash=b=>createHash('sha256').update(b).digest('hex'),out=DIR+'/physical-pdfs';mkdirSync(out,{recursive:true,mode:0o700});
if(mode!=='upload'){
  const attachments=mode==='prepare'?sql(`select a.id,a.order_id,a.file_url,a.uploaded_by from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and a.id in(${jobs.map(job=>q(uid('report-bundle-'+job.id))).join(',')})`):[];
  const require=createRequire(import.meta.url);
  await build({entryPoints:['supabase/functions/genera-pdf-rapportino/render.ts'],outbase:'supabase/functions',outdir:DIR+'/physical-renderers',bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'deno-pdf',setup(b){b.onResolve({filter:/^https:\/\/esm.sh\/pdf-lib/},()=>({path:require.resolve('pdf-lib')}));}}]});
  const {renderRapportino}=await import(pathToFileURL(resolve(DIR+'/physical-renderers/genera-pdf-rapportino/render.mjs')));
  const manifest=[],plan=read('physical-operations-plan');
  for(const [index,job] of jobs.entries()){
    if(mode==='preview'&&index>2)break;
    const reports=sources.reports.filter(r=>r.order_id===job.id).sort((a,b)=>a.data_lavoro.localeCompare(b.data_lavoro));
    const selected=mode==='preview'?reports.slice(0,1):reports,order=before.orders.find(o=>o.id===job.id),merged=await PDFDocument.create();
    for(const report of selected){
      const result=await renderRapportino({report:{...report,ordine:order,autore:{first_name:'Simulazione',last_name:'DEMO - nessun autore reale'}},company:{name:'Demo Azienda 2 S.r.l.'},branding:{primaryColor:'#193E68'},phases:d.order_work_phases.filter(p=>p.order_id===job.id),punches:[],warnings:[],revision:'DEMO55-TRACE-2025',generatedAt:'2026-10-10T08:00:00Z'},async()=>null);
      if(result.warnings.length)throw Error('Incomplete document source');
      const digest=hash(result.bytes),path=`${C}/${job.id}/${report.id}/trace-${digest.slice(0,16)}.pdf`,file=out+'/report-'+report.id+'.pdf';writeFileSync(file,result.bytes,{mode:0o600});
      if(index<3&&selected.indexOf(report)===0){
        const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
        if(!text.includes(job.code)||!text.includes('DEMO')||report.materiali_usati.some(m=>!text.includes(m.nome.replace(/[–—]/g,'-'))))throw Error('PDF missing linked material rows');
      }
      const pdf=await PDFDocument.load(result.bytes);const pages=await merged.copyPages(pdf,pdf.getPageIndices());pages.forEach(p=>merged.addPage(p));
      manifest.push({bucket:'campo-rapportini',path,file,digest,orderId:job.id,reportId:report.id});
      if(mode==='prepare')plan.batches[index].push(`update campo_rapportini set pdf_url=${q('https://rsbrguhkodgnqfomrevo.supabase.co/storage/v1/object/public/campo-rapportini/'+path)} where id=${q(report.id)} and company_id=${q(C)};`);
    }
    if(mode==='prepare'){
      const bytes=await merged.save(),digest=hash(bytes),path=`orders/${job.id}/demo-55m/rapportini-trace-${digest.slice(0,16)}.pdf`,file=out+'/'+job.code+'-rapportini.pdf';writeFileSync(file,bytes,{mode:0o600});
      manifest.push({bucket:'order-attachments',path,file,digest,orderId:job.id});
      const original=attachments.find(a=>a.id===uid('report-bundle-'+job.id));if(!original)throw Error('Missing original report bundle');
      plan.batches[index].push(`do $$begin if not exists(select 1 from order_attachments where id=${q(original.id)} and order_id=${q(job.id)} and file_url=${q(original.file_url)} and uploaded_by=${q(A)}) then raise exception 'Bundle changed since audit';end if;end $$;`,
        `update order_attachments set file_url=${q(path)},file_size=${bytes.length} where id=${q(original.id)} and order_id=${q(job.id)};`);
    }
    console.log(mode.toUpperCase(),job.code,'reports='+selected.length,'pages='+merged.getPageCount());
  }
  save('physical-pdf-'+mode,manifest);
  if(mode==='prepare'){
    // New plan must be dry-tested again: do not reuse checkpoints for the pre-PDF plan.
    save('physical-complete-plan',plan);
  }
}else{
  const buckets=sql("select id,public from storage.buckets where id in('campo-rapportini','order-attachments')");if(buckets.length!==2||buckets.some(b=>b.public))throw Error('Storage must stay private');
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Missing authorized storage access');
  const admin=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}}),manifest=read('physical-pdf-prepare');
  const completed=existsSync(out+'/uploads.json')?JSON.parse(readFileSync(out+'/uploads.json','utf8')):[];
  for(let i=0;i<manifest.length;i+=8){
    const group=manifest.slice(i,i+8).filter(m=>!completed.includes(m.path));
    await Promise.all(group.map(async m=>{
      if(!jobs.some(j=>j.id===m.orderId)||!(m.path.startsWith(C+'/'+m.orderId+'/')||m.bucket==='order-attachments'&&m.path.startsWith('orders/'+m.orderId+'/demo-55m/')))throw Error('Cross-tenant upload refused');
      const bytes=readFileSync(m.file);if(hash(bytes)!==m.digest)throw Error('Local source changed');
      const {error}=await admin.storage.from(m.bucket).upload(m.path,bytes,{contentType:'application/pdf',upsert:false});
      // Both new and existing uploads are downloaded and compared; a checkpoint alone is not proof.
      if(error&&!String(error.message).toLowerCase().includes('already exists'))throw error;
      const {data,error:err}=await admin.storage.from(m.bucket).download(m.path);if(err||hash(new Uint8Array(await data.arrayBuffer()))!==m.digest)throw Error('Stored document verification failed');
      completed.push(m.path);
    }));
    writeFileSync(out+'/uploads.json',JSON.stringify(completed),{mode:0o600});
    if(i%80===0||i+8>=manifest.length)console.log('VERIFIED PDFs',completed.length+'/'+manifest.length);
  }
}
