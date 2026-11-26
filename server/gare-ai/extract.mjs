import {execFile} from '../gare-ai/runtime.mjs';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile,rm,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runtimeDir} from '../gare-ai/runtime.mjs';
import {checkDocxArchive} from '../gare-templates/docx_fields.mjs';
import {nativeOCR,normalizeSource} from '../gare-intake/formats.mjs';
import {archiveInventory} from '../gare-intake/archive.mjs';
import {visionText,privateInference} from './inference.mjs';
const exec=promisify(execFile);
export const READER_REVISION=2;
const locks=new Map();
export const isDocumentReading=(companyId,doc)=>locks.has(`${companyId}:gare_document_texts:${doc.id}:${doc.sha256}`);
const xmlText=xml=>xml.replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<w:br\b[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n\n').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export const reusableReading=c=>c?.coverage?.reader_revision===READER_REVISION&&c.coverage.status==='complete'&&!c.coverage.partial;
export function readingCoverage(doc,pages,{totalPages=null,done=[],warnings=[],errors=[],status='running'}={}){
 const read=new Set(pages.map(p=>p.page).filter(Boolean));const unread=totalPages?Array.from({length:totalPages},(_,i)=>i+1).filter(p=>!done.includes(p)):[];
 return{document_id:doc.id,name:doc.name,reader_revision:READER_REVISION,segments:pages.length,total_pages:totalPages,pages_read:read.size,completed_pages:done,unread_pages:unread,method:[...new Set(pages.map(p=>p.method))].join(', ')||'nessun testo',partial:!!unread.length||!!errors.length||!pages.length,needs_visual_review:pages.some(p=>p.needs_visual_review),status,errors,warnings,updated_at:new Date().toISOString()};
}
function chunks(raw,doc){return raw.filter(p=>p.text.trim().length>10).flatMap(p=>{const rows=[];for(let start=0;start<p.text.length;start+=8500)rows.push({...p,text:p.text.slice(start,start+9000),section:p.text.length>9000?`${p.section}, parte ${Math.floor(start/8500)+1}`:p.section,document_id:doc.id,version:doc.version});return rows;});}
async function locked(key,task){const previous=locks.get(key)||Promise.resolve();let release;const held=new Promise(r=>{release=r;});const tail=previous.catch(()=>{}).then(()=>held);locks.set(key,tail);await previous.catch(()=>{});try{return await task();}finally{release();if(locks.get(key)===tail)locks.delete(key);}}
export async function extractDocuments(ctx,documents,jobId,{signal=new AbortController().signal,progress=async()=>{},cacheTable='gare_document_texts'}={}){
 if(!['gare_document_texts','gare_company_document_texts'].includes(cacheTable))throw Error('Archivio di lettura non consentito');
 const{client,service,companyId}=ctx,started=Date.now(),root=path.join(runtimeDir,'ai');await mkdir(root,{recursive:true});
 const dir=await mkdtemp(path.join(root,'reader-'));const pages=[],warnings=[],coverage=[];let visionPages=0;
 try{for(let index=0;index<documents.length;index++){
  if(signal.aborted)throw Error('Elaborazione annullata');const doc=documents[index];
  const result=await locked(`${companyId}:${cacheTable}:${doc.id}:${doc.sha256}`,async()=>{
   if(signal.aborted)throw Error('Elaborazione annullata');
   const{data:cached,error:cacheError}=await ctx.client.from(cacheTable).select('*').eq('document_id',doc.id).eq('sha256',doc.sha256).maybeSingle();if(cacheError)throw Error(cacheError.message);
   if(reusableReading(cached)&&!doc.name.toLowerCase().endsWith('.zip'))return cached;
   const{data:blob,error}=await ctx.client.storage.from('gare-private').download(doc.storage_path);if(error)throw Error(error.message);
   let buffer=Buffer.from(await blob.arrayBuffer());if(createHash('sha256').update(buffer).digest('hex')!==doc.sha256)throw Error(`Hash non coerente: ${doc.name}`);
   let ext=path.extname(doc.name).toLowerCase(),totalPages=null,extracted=[],done=[];let docWarnings=[],errors=[];
   if(cached?.coverage?.reader_revision===READER_REVISION){extracted=cached.pages||[];done=cached.coverage.completed_pages||[];docWarnings=(cached.coverage.warnings||[]).filter(w=>!w.startsWith('Lettura interrotta'));}
   const save=async(status)=>{
    const cov=readingCoverage(doc,extracted,{totalPages,done,warnings:[...new Set(docWarnings)],errors,status});
    const row={company_id:companyId,document_id:doc.id,sha256:doc.sha256,pages:extracted,warnings:[...new Set([...docWarnings,...errors])].map(w=>`${doc.name}: ${w}`),coverage:cov};
    const{error}=await service.from(cacheTable).upsert(row,{onConflict:'document_id'});if(error)throw Error(`Salvataggio lettura non riuscito: ${error.message}`);return row;
   };
   await progress(Math.round(5+index/documents.length*25),`Lettura ${index+1}/${documents.length}: ${doc.name}`);
   if(ext==='.zip'&&cacheTable==='gare_document_texts'){
    try{
     const file=path.join(dir,`${doc.id}.zip`);await writeFile(file,buffer);const inventory=await archiveInventory(file,{signal});
     const{data:children,error}=await ctx.client.from('gare_documents').select('source_entry').eq('source_parent_id',doc.id).eq('source_parent_sha256',doc.sha256).eq('company_id',companyId);if(error)throw Error(error.message);
     const missing=inventory.entries.filter(e=>!children.some(c=>c.source_entry===e.path));
     const cov={document_id:doc.id,name:doc.name,reader_revision:READER_REVISION,kind:'archive',segments:0,total_pages:null,pages_read:0,method:'Inventario ZIP · allegati analizzati separatamente',partial:missing.length>0,status:missing.length?'partial':'complete',needs_visual_review:false,members:inventory.entries.length,imported_members:inventory.entries.length-missing.length,updated_at:new Date().toISOString()};
     const row={company_id:companyId,document_id:doc.id,sha256:doc.sha256,pages:[],warnings:missing.length?[`${doc.name}: ${missing.length} allegati non acquisiti; aprire l’inventario ZIP. I formati non supportati richiedono controllo manuale.`]:[],coverage:cov};
     const saved=await service.from(cacheTable).upsert(row,{onConflict:'document_id'});if(saved.error)throw Error(saved.error.message);return row;
    }catch(e){if(signal.aborted)throw e;errors.push(`Inventario ZIP: ${e.message}`);return save('partial');}
   }
   try{
    const normalized=await normalizeSource(buffer,doc.name,dir,{signal});buffer=normalized.buffer;ext=normalized.ext;docWarnings.push(...normalized.warnings);
    const file=path.join(dir,`${doc.id}${ext}`);await writeFile(file,buffer);
    const readVisual=async(page,isPDF)=>{
     if(visionPages>=40)throw Error('Limite di 40 pagine OCR raggiunto: riprendi la lettura per completare le pagine restanti');
     let image=file;
     if(isPDF&&process.platform!=='darwin'){
      const prefix=path.join(dir,`${doc.id}-${page}`);
      await exec('pdftoppm',['-f',String(page),'-l',String(page),'-scale-to','1600','-singlefile','-png',file,prefix],{signal,timeout:30000,maxBuffer:100000});
      image=prefix+'.png';
     }
     try{
      const r=await nativeOCR(image,page,{signal});
      visionPages++;
      return{text:r.text,confidence:r.confidence,method:`OCR ${process.platform==='darwin'?'Apple Vision':'Tesseract'} · da verificare`,needs_visual_review:true};
     }catch(error){
      if(signal.aborted||!privateInference||process.platform==='darwin')throw error;
      const text=await visionText(await readFile(image),{signal});
      visionPages++;
      return{text,method:'trascrizione visiva con il motore privato · da verificare',needs_visual_review:true};
     }
    };
    if(ext==='.pdf'){
     const info=await exec('pdfinfo',[file],{signal,timeout:15000,maxBuffer:100000});totalPages=Number(info.stdout.match(/^Pages:\s*(\d+)/m)?.[1]||0);
     if(!totalPages||totalPages>500)throw Error('PDF oltre il limite di 500 pagine o numero di pagine non leggibile: suddividere una copia conservando l’originale');
     const output=await exec('pdftotext',['-layout','-enc','UTF-8',file,'-'],{signal,timeout:60000,maxBuffer:15000000});const texts=output.stdout.split('\f');
     await save('running');
     for(let page=1;page<=totalPages;page++){
      if(signal.aborted)throw Error('Elaborazione annullata');if(done.includes(page))continue;
      await progress(Math.round(5+(index+(page-1)/totalPages)/documents.length*25),`Lettura locale: ${doc.name}, pagina ${page}/${totalPages}`);
      try{
       let raw={text:texts[page-1]||'',method:'testo PDF',needs_visual_review:false};
       if(raw.text.trim().length<35)raw=await readVisual(page,true);
       if(raw.text.trim().length<=10)throw Error('Testo assente o illeggibile: controllare se la pagina è vuota o richiede lettura manuale');
       extracted.push(...chunks([{...raw,page,section:`Pagina ${page}`}],doc));done.push(page);
      }catch(e){if(signal.aborted)throw e;errors.push(`Pagina ${page}: ${e.message}`);}
      await save('running');
     }
    }else if(ext==='.docx'){
     checkDocxArchive(buffer);const output=await exec('unzip',['-p',file,'word/document.xml'],{signal,timeout:15000,maxBuffer:10000000});
     extracted=chunks(xmlText(output.stdout).split(/\n\s*\n/).filter(t=>t.trim()).map((text,i)=>({text,page:null,section:`Paragrafo ${i+1}`,method:normalized.converted?'testo DOC convertito localmente':'testo DOCX',needs_visual_review:normalized.converted})),doc);
    }else if(['.txt','.md','.csv','.xml'].includes(ext)){
     const text=new TextDecoder('utf-8').decode(buffer);if(text.includes('\u0000'))throw Error('Contenuto binario non supportato');
     extracted=chunks(text.split(/\n\s*\n/).filter(t=>t.trim()).map((text,i)=>({text,page:null,section:`Sezione ${i+1}`,method:'testo'})),doc);
     if(ext==='.xml')docWarnings.push('Testo XML letto per consultazione; schema ed eDGUE non validati.');
    }else if(['.png','.jpg','.jpeg','.webp'].includes(ext)){
     totalPages=1;const raw=await readVisual(1,false);extracted=chunks([{...raw,page:1,section:'Immagine 1'}],doc);if(extracted.length)done=[1];
    }else if(ext==='.zip')throw Error('Archivio conservato: apri Acquisizione e lettura per scegliere e acquisire gli allegati');
    else throw Error(`Formato ${ext||'sconosciuto'} conservato ma non analizzato: percorso manuale richiesto`);
   }catch(e){if(signal.aborted){docWarnings.push('Lettura interrotta: le pagine completate sono salvate. Riprendi per completare.');await save('interrupted');throw e;}errors.push(e.message);}
   if(!extracted.length)errors.push('Nessun testo disponibile: necessario intervento manuale.');
   if(extracted.some(p=>p.needs_visual_review))docWarnings.push('OCR o conversione locale: verificare numeri, date, tabelle e leggibilità sugli originali. La lettura completa non certifica la correttezza.');
   if(extracted.some(p=>/ignore (all |the )?(previous|system)|ignora (tutte )?(le )?istruzioni|system prompt|api[_ -]?key/i.test(p.text)))docWarnings.push('Possibili istruzioni rivolte a un modello nel documento: trattate solo come dati.');
   const row=await save('complete');if(row.coverage.partial){row.coverage.status='partial';const{error}=await service.from(cacheTable).upsert(row,{onConflict:'document_id'});if(error)throw Error(error.message);}return row;
  });pages.push(...result.pages);warnings.push(...result.warnings);coverage.push(result.coverage);
 }}finally{await rm(dir,{recursive:true,force:true});}
 return{pages,warnings,coverage,duration_ms:Date.now()-started,vision_pages:visionPages};
}
