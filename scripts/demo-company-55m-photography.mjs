/** Tenant-owned illustrative photos + matching report PDFs; originals retained. */
import { C,A,DIR,MARK,uid,q,j,insert,read,save,sql,guard } from './demo-company-55m.mjs';
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
const mode=process.argv[2]??'preview';
if(!['preview','prepare','upload','verify'].includes(mode))throw Error('Unsupported mode');
guard();
const hash=b=>createHash('sha256').update(b).digest('hex');
const dir=DIR+'/photography-pdfs',photosDir=DIR+'/demo-photos';
mkdirSync(dir,{recursive:true,mode:0o700});
const before=read('photography-before'),jobs=read('business-manifest').orders,phases=read('after').order_work_phases;
const marker='[PHOTO v1] Immagini sintetiche esemplificative condivise tra cantieri demo, non fotografie dei luoghi né prove dei lavori reali.';
if(mode==='verify'){
  const [r]=sql(`select jsonb_build_object(
    'reportsWithPhotos',(select count(*) from campo_rapportini where company_id=${q(C)} and order_id in(${jobs.map(x=>q(x.id)).join(',')}) and cardinality(foto_urls)>0 and note like '%[PHOTO v1]%'),
    'photos',(select count(*) from foto_cantiere where company_id=${q(C)} and source='api' and descrizione like ${q(MARK+' [PHOTO v1]%')}),
    'customerVisible',(select count(*) from foto_cantiere where company_id=${q(C)} and source='api' and descrizione like ${q(MARK+' [PHOTO v1]%')} and visibile_cliente),
    'costs',(select jsonb_agg(jsonb_build_object('id',id,'cost',consuntivo)) from v_ordine_marginalita where company_id=${q(C)}),
    'cash',(select sum(case when direction='entrata' then amount else -amount end) from prima_nota_entries where company_id=${q(C)})
  ) data`);
  const baseline=read('operations-economic-before');
  if(r.data.reportsWithPhotos!==1408||r.data.photos!==144||r.data.customerVisible||r.data.cash!==baseline.cash||baseline.margins.some(m=>r.data.costs.find(c=>c.id===m.id)?.cost!==m.cost))throw Error('Photo/economic verification failed');
  save('photography-verified',r.data);console.log({...r.data,costs:'Unchanged',sharedIllustrations:3});
}else if(mode==='upload'){
  const manifest=read('photography-assets'),buckets=sql("select id,public from storage.buckets where id in('foto-cantiere','campo-rapportini','order-attachments')");
  if(buckets.length!==3||buckets.some(b=>b.public))throw Error('Private buckets required');
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Missing authorized storage access');
  const admin=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
  const completed=existsSync(dir+'/uploads.json')?JSON.parse(readFileSync(dir+'/uploads.json','utf8')):[];
  for(let i=0;i<manifest.length;i+=8){
    await Promise.all(manifest.slice(i,i+8).filter(m=>!completed.includes(m.bucket+':'+m.path)).map(async m=>{
      if(!jobs.some(j=>j.id===m.orderId)||!(m.path.startsWith(C+'/'+m.orderId+'/')||m.bucket==='order-attachments'&&m.path.startsWith('orders/'+m.orderId+'/demo-55m/')))throw Error('Cross-tenant storage refused');
      const bytes=readFileSync(m.file);if(hash(bytes)!==m.digest)throw Error('Asset changed since prepare');
      const {error}=await admin.storage.from(m.bucket).upload(m.path,bytes,{contentType:m.type,upsert:false});
      if(error&&!String(error.message).toLowerCase().includes('already exists'))throw error;
      const {data,error:err}=await admin.storage.from(m.bucket).download(m.path);
      if(err||hash(new Uint8Array(await data.arrayBuffer()))!==m.digest)throw Error('Private stored asset differs');
      completed.push(m.bucket+':'+m.path);
    }));
    writeFileSync(dir+'/uploads.json',JSON.stringify(completed),{mode:0o600});
    if(i%80===0||i+8>=manifest.length)console.log('VERIFIED',completed.length+'/'+manifest.length);
  }
}else{
  if(existsSync(DIR+'/photography-applied.json'))throw Error('Applied photography plan immutable');
  const require=createRequire(import.meta.url);
  await build({entryPoints:['supabase/functions/genera-pdf-rapportino/render.ts'],outdir:dir+'/renderer',bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'deno-pdf',setup(b){b.onResolve({filter:/^https:\/\/esm.sh\/pdf-lib/},()=>({path:require.resolve('pdf-lib')}));}}]});
  const {renderRapportino}=await import(pathToFileURL(resolve(dir+'/renderer/render.mjs')));
  const kinds=['demolizioni','impianti','finiture'],images=new Map();
  // Delivery encoding only: unchanged scene, full frame and DEMO caption retained.
  for(const kind of kinds){const file=photosDir+'/'+kind+'.jpg';await sharp(photosDir+'/'+kind+'.png').resize({width:1000,withoutEnlargement:true}).jpeg({quality:80}).toFile(file);images.set(kind,{file,bytes:readFileSync(file)});}
  const manifest=[],batches=[];
  for(const [index,job]of jobs.entries()){
    if(mode==='preview'&&index>2)break;
    const order=before.orders.find(o=>o.id===job.id),reports=before.reports.filter(r=>r.order_id===job.id).sort((a,b)=>a.data_lavoro.localeCompare(b.data_lavoro)),merged=await PDFDocument.create(),statements=[];
    if(!order?.internal_notes?.includes(MARK)||reports.some(r=>r.stato!=='approvato'||r.foto_urls?.length||!r.note?.includes(MARK)))throw Error('Non-owned report or existing photos: review required');
    const refs=new Map();
    for(const [n,kind]of kinds.entries()){
      const image=images.get(kind),digest=hash(image.bytes),path=`${C}/${job.id}/demo-photos/${kind}-${digest.slice(0,16)}.jpg`;
      const url='https://rsbrguhkodgnqfomrevo.supabase.co/storage/v1/object/public/foto-cantiere/'+path;
      refs.set(kind,{url,...image});
      manifest.push({bucket:'foto-cantiere',path,file:image.file,digest,type:'image/jpeg',orderId:job.id});
      statements.push(insert('foto_cantiere',{id:uid('photo-v1-'+job.id+'-'+kind),company_id:C,order_id:job.id,storage_path:path,thumbnail_path:path,
        descrizione:MARK+' '+marker+' Esempio: '+kind,tags:`{DEMO,sintetica,esempio-condiviso,${kind}}`,source:'api',uploaded_by:A,
        taken_at:(n===0?job.start:n===2?job.end:reports[Math.floor(reports.length/2)].data_lavoro)+'T12:00:00Z',visibile_cliente:false}));
    }
    const selected=mode==='preview'?[reports[0],reports[Math.floor(reports.length/2)],reports.at(-1)]:reports;
    for(const [rIndex,r]of selected.entries()){
      const progress=reports.indexOf(r)/Math.max(1,reports.length-1),kind=progress<.25?'demolizioni':progress<.7?'impianti':'finiture',photo=refs.get(kind);
      // Generic daily example, not a fabricated phase-specific evidentiary photo.
      const updated={...r,foto_urls:[photo.url],note:r.note+' '+marker};
      const result=await renderRapportino({report:{...updated,ordine:order,autore:{first_name:'Simulazione',last_name:'DEMO - nessun autore reale'}},company:{name:'Demo Azienda 2 S.r.l.'},branding:{primaryColor:'#193E68'},phases:phases.filter(p=>p.order_id===job.id),punches:[],warnings:[],revision:'DEMO55-TRACE-PHOTO-2025',generatedAt:'2026-10-10T09:00:00Z'},async(ref,type)=>type==='photo'&&ref===photo.url?photo.bytes:null);
      if(result.warnings.length)throw Error('Incomplete photographic report');
      const digest=hash(result.bytes),path=`${C}/${job.id}/${r.id}/trace-photos-${digest.slice(0,16)}.pdf`,file=dir+'/report-'+r.id+'.pdf';writeFileSync(file,result.bytes,{mode:0o600});
      const pdf=await PDFDocument.load(result.bytes),pages=await merged.copyPages(pdf,pdf.getPageIndices());pages.forEach(p=>merged.addPage(p));
      if(mode==='preview'){
        const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
        if(!text.includes(job.code)||!text.toLowerCase().includes('documentazione fotografica')||!text.includes('Immagini sintetiche'))throw Error('Missing photo or provenance in PDF');
      }
      manifest.push({bucket:'campo-rapportini',path,file,digest,type:'application/pdf',orderId:job.id,reportId:r.id});
      statements.push(`do $$begin update campo_rapportini set foto_urls=array[${q(photo.url)}],note=${q(updated.note)},pdf_url=${q('https://rsbrguhkodgnqfomrevo.supabase.co/storage/v1/object/public/campo-rapportini/'+path)}
        where id=${q(r.id)} and company_id=${q(C)} and order_id=${q(job.id)} and stato='approvato'
        and updated_at=${q(r.updated_at)}::timestamptz and note is not distinct from ${q(r.note)} and coalesce(cardinality(foto_urls),0)=0
        and materiali_usati=${j(r.materiali_usati)};
        if not found then raise exception 'Report changed concurrently';end if;end $$;`);
    }
    const bytes=await merged.save(),digest=hash(bytes),path=`orders/${job.id}/demo-55m/rapportini-trace-photos-${digest.slice(0,16)}.pdf`,file=dir+'/'+job.code+'-rapportini.pdf';writeFileSync(file,bytes,{mode:0o600});
    manifest.push({bucket:'order-attachments',path,file,digest,type:'application/pdf',orderId:job.id});
    const original=before.attachments.find(a=>a.id===uid('report-bundle-'+job.id));if(!original)throw Error('Missing saved report bundle');
    statements.push(insert('order_attachments',{id:uid('photography-previous-bundle-'+job.id),order_id:job.id,file_name:'DEMO - Archivio rapportini prima delle foto - '+job.code+'.pdf',file_url:original.file_url,file_type:'application/pdf',file_size:original.file_size,uploaded_by:A,visible_to_customer:false,folder_id:original.folder_id}));
    statements.push(`do $$begin update order_attachments set file_url=${q(path)},file_size=${bytes.length}
      where id=${q(original.id)} and order_id=${q(job.id)} and file_url=${q(original.file_url)} and uploaded_by=${q(A)};
      if not found then raise exception 'Report bundle changed concurrently';end if;end $$;`);
    batches.push(statements);console.log(mode.toUpperCase(),job.code,'reports='+selected.length,'pages='+merged.getPageCount());
  }
  save('photography-'+mode+'-assets',manifest);
  if(mode==='prepare'){save('photography-assets',manifest);save('photography-plan',{company:C,marker:MARK,batches});}
}
