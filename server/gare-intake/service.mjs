import {z} from 'zod';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from '../gare-ai/runtime.mjs';
import {promisify} from 'node:util';
import path from 'node:path';
import {runtimeDir} from '../gare-ai/runtime.mjs';
import {sourceText,reviewSourceText} from './text.mjs';
import {readingUnits} from '../../src/modules/gare-appalti/reader/text-model.js';
import {archiveInventory} from './archive.mjs';
import {extractDocuments,READER_REVISION,isDocumentReading} from '../gare-ai/extract.mjs';
import {normalizeSource} from './formats.mjs';
import {safePreviewCopy} from '../gare-templates/docx_fields.mjs';
import {currentDocuments} from '../../src/modules/gare-appalti/source-current.js';
import {safeName} from '../gare-ai/documents.mjs';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const inputSchema=z.object({document_id:z.string().uuid(),selected:z.array(z.string().regex(/^\d{1,4}$/)).min(1).max(100).optional(),page:z.number().int().min(1).max(500).default(1),confirmed:z.boolean().optional(),unit_key:z.string().max(40).optional(),extracted_sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),review_status:z.enum(['controllato','problema']).optional(),note:z.string().max(2000).default(''),expected_revision:z.number().int().min(0).optional()}).strict();
async function ok(p){const{data,error}=await p;if(error)throw Error(error.message);return data;}
function kind(name){if(/disciplinare/i.test(name))return'disciplinare';if(/computo|prezz/i.test(name))return'computo';if(/capitolato|CSA/i.test(name))return'capitolato';if(/istanza|domanda|dichiarazione|dgue|allegato.*[A-F]\b/i.test(name))return'modello';if(/chiariment/i.test(name))return'chiarimento';return'allegato';}
export function installGareIntake(middlewares,{auth,service}){
 const active=new Map(),failuresByDocument=new Map();
 middlewares.use('/api/gare-intake',async(req,res,next)=>{let dir;
  try{
   if(req.method!=='POST')return next();const ctx=await auth(req);let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)throw Error('Richiesta troppo grande');}
   const input=inputSchema.parse(JSON.parse(raw)),route=new URL(req.url,'http://127.0.0.1').pathname;
   if(!['/status','/catalog','/read','/cancel','/import','/page','/text','/review'].includes(route))return next();
   if(['/read','/cancel','/import'].includes(route)&&!['admin','editor'].includes(ctx.role)){const e=Error('Permesso di modifica richiesto');e.status=403;throw e;}
   const doc=await ok(ctx.client.from('gare_documents').select('*').eq('id',input.document_id).eq('company_id',ctx.companyId).eq('category','fonte').single());
   const current=await ok(ctx.client.rpc('gare_source_current',{did:doc.id}));if(!current&&!['/status','/page','/text'].includes(route))throw Error('Fonte storica: usare la versione corrente');
   const key=`${ctx.companyId}:${doc.id}:${doc.sha256}`;let result;
   if(route==='/text')result=await sourceText(ctx,doc);
   else if(route==='/review'){if(!input.confirmed||!input.unit_key||!input.extracted_sha256||!input.review_status||input.expected_revision===undefined)throw Error('Conferma il controllo della pagina corrente');if(input.review_status==='problema'&&input.note.trim().length<5)throw Error('Descrivi il problema di lettura');result=await reviewSourceText(ctx,doc,input);}
   else if(route==='/status'){
    const cached=await ok(ctx.client.from('gare_document_texts').select('coverage,warnings').eq('document_id',doc.id).eq('sha256',doc.sha256).maybeSingle());const running=active.get(key);
    let coverage=cached?.coverage||null;if(coverage?.status==='running'&&!running&&!isDocumentReading(ctx.companyId,doc))coverage={...coverage,status:'interrupted'};
    result={document_id:doc.id,coverage,warnings:cached?.warnings||[],running:!!running||isDocumentReading(ctx.companyId,doc),can_cancel:!!running,message:running?.message||null,error:failuresByDocument.get(key)||null,current,reader_current:coverage?.reader_revision===READER_REVISION};
   }else if(route==='/read'){
    if(/\.zip$/i.test(doc.name))throw Error('Scegli e acquisisci prima gli allegati dell’archivio');
    if(!active.has(key)){
     if(active.size>=2)throw Error('Sono già in corso due letture locali: attendi prima di avviarne un’altra');
     failuresByDocument.delete(key);
     const controller=new AbortController(),task={controller,message:'Avvio della lettura locale'};active.set(key,task);
     void extractDocuments(ctx,[doc],`intake-${randomUUID()}`,{signal:controller.signal,progress:async(_percent,message)=>{task.message=message;}}).catch(async error=>{
      // Successful pages already persisted by the reader remain available.
      task.message=error.message;if(!controller.signal.aborted){if(failuresByDocument.size>100)failuresByDocument.clear();failuresByDocument.set(key,error.message);}
     }).finally(()=>{active.delete(key);});
    }result={started:true,document_id:doc.id};
   }else if(route==='/cancel'){active.get(key)?.controller.abort();result={stopping:true};}
   else{
    const root=path.join(runtimeDir,'intake');await mkdir(root,{recursive:true});dir=await mkdtemp(path.join(root,'request-'));
    const blob=await ok(ctx.client.storage.from('gare-private').download(doc.storage_path));const buffer=Buffer.from(await blob.arrayBuffer());if(hash(buffer)!==doc.sha256)throw Error('Hash dell’originale non coerente');
    if(route==='/catalog'||route==='/import'){
     if(!/\.zip$/i.test(doc.name))throw Error('Seleziona un originale ZIP');
     if(route==='/import'&&(!input.confirmed||!input.selected?.length))throw Error('Conferma gli allegati da acquisire');
     const source=path.join(dir,'original.zip');await writeFile(source,buffer);
     const catalog=await archiveInventory(source,route==='/import'?{selected:input.selected,output:dir}:{});
     const children=await ok(ctx.client.from('gare_documents').select('*').eq('source_parent_id',doc.id).eq('company_id',ctx.companyId));const imported=[];const failures=[];
     if(route==='/import')for(const entry of catalog.entries.filter(e=>input.selected.includes(e.key))){
      const existing=currentDocuments([doc,...children]).find(c=>c.source_entry===entry.path);if(existing){imported.push(existing);continue;}
      const bytes=await readFile(entry.file),id=randomUUID(),name=entry.name,storage_path=`${ctx.companyId}/${id}/${safeName(name)}`;
      try{
       await ok(ctx.client.storage.from('gare-private').upload(storage_path,bytes,{upsert:false,contentType:'application/octet-stream'}));
       const child=await ok(service.from('gare_documents').insert({id,company_id:ctx.companyId,tender_id:doc.tender_id,participation_id:null,category:'fonte',document_kind:kind(name),name,storage_path,sha256:hash(bytes),size_bytes:bytes.length,version:1,generation_snapshot:{source_intake:{operation:'zip_member',imported_by:ctx.userId}},source_parent_id:doc.id,source_parent_sha256:doc.sha256,source_entry:entry.path}).select().single());await ok(service.from('gare_audit').update({actor:ctx.userId}).eq('entity_id',id).eq('entity_type','gare_documents').eq('company_id',ctx.companyId).is('actor',null));children.push(child);imported.push(child);
      }catch(error){
       // Roll back only this request's newly uploaded unreferenced object. On an
       // idempotency race, return the winning immutable row instead.
       const winner=await ok(ctx.client.from('gare_documents').select('*').eq('source_parent_id',doc.id).eq('source_entry',entry.path).order('version',{ascending:false}).limit(1).maybeSingle());
       if(winner){imported.push(winner);children.push(winner);}
       else failures.push({path:entry.path,error:error.message});
       await ctx.client.storage.from('gare-private').remove([storage_path]);
      }
     }
     result={document_id:doc.id,...catalog,entries:catalog.entries.map(({file,...e})=>({...e,document_kind:kind(e.name),imported_document_id:currentDocuments([doc,...children]).find(c=>c.source_entry===e.path)?.id||null})),imported,failures,original_preserved:true};
    }else if(route==='/page'){
     const normalized=await normalizeSource(buffer,doc.name,dir);let file=path.join(dir,'source'+normalized.ext);await writeFile(file,normalized.buffer);
     if(normalized.ext==='.docx'){
      await writeFile(file,await safePreviewCopy(normalized.buffer));await exec('soffice',[`-env:UserInstallation=file://${path.join(dir,'profile')}`,'--headless','--convert-to','pdf','--outdir',dir,file],{timeout:60000,maxBuffer:100000});file=path.join(dir,'source.pdf');
     }else if(normalized.ext!=='.pdf')throw Error('Anteprima pagina disponibile per PDF, P7M PDF e Word. Scarica l’originale per gli altri formati.');
     const info=await exec('pdfinfo',[file],{timeout:15000,maxBuffer:100000});const count=Number(info.stdout.match(/^Pages:\s*(\d+)/m)?.[1]||0);if(input.page>count)throw Error('Pagina non presente');
     const prefix=path.join(dir,'page');await exec('pdftoppm',['-f',String(input.page),'-l',String(input.page),'-scale-to','1600','-singlefile','-png',file,prefix],{timeout:30000,maxBuffer:100000});
     const cached=await ok(ctx.client.from('gare_document_texts').select('pages,coverage').eq('document_id',doc.id).eq('sha256',doc.sha256).maybeSingle());
     result={image_base64:(await readFile(prefix+'.png')).toString('base64'),page:input.page,page_count:count,text:readingUnits(cached?.pages||[],cached?.coverage||{}).find(u=>u.page===input.page)?.text||'',warnings:normalized.warnings,name:doc.name,sha256:doc.sha256,converted:normalized.converted};
    }
   }
   res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
  }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error instanceof z.ZodError?'Dati di acquisizione non validi':error.message}));}
  finally{if(dir)await rm(dir,{recursive:true,force:true});}
 });
}
