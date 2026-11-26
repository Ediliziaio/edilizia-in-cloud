import {createHash} from 'node:crypto';
import {readingUnits} from '../../src/modules/gare-appalti/reader/text-model.js';
import {READER_REVISION,isDocumentReading} from '../gare-ai/extract.mjs';
const digest=text=>createHash('sha256').update(text).digest('hex');
async function ok(q){const{data,error}=await q;if(error)throw Error(error.message);return data;}
function conflict(message){const error=Error(message);error.status=409;throw error;}
export async function sourceText(ctx,doc){
 const cached=await ok(ctx.client.from('gare_document_texts').select('*').eq('company_id',ctx.companyId).eq('document_id',doc.id).eq('sha256',doc.sha256).maybeSingle());
 const reviews=[];for(let offset=0;offset<50000;offset+=1000){const rows=await ok(ctx.client.from('gare_source_reviews').select('*').eq('company_id',ctx.companyId).eq('document_id',doc.id).eq('source_sha256',doc.sha256).order('id').range(offset,offset+999));reviews.push(...rows);if(rows.length<1000)break;if(offset===49000)throw Error('Archivio dei controlli molto esteso: restringere la consultazione, nessun elenco parziale viene mostrato');}
 const running=isDocumentReading(ctx.companyId,doc);let coverage=cached?.coverage||null;if(coverage?.status==='running'&&!running)coverage={...coverage,status:'interrupted'};
 const units=readingUnits(cached?.pages||[],coverage||{}).map(unit=>{
  const text_sha256=digest(unit.text),same=reviews.filter(r=>r.unit_key===unit.key);return{...unit,text_sha256,review:same.find(r=>r.extracted_sha256===text_sha256)||null,stale_reviews:same.filter(r=>r.extracted_sha256!==text_sha256).length,previous_reviews:same.filter(r=>r.extracted_sha256!==text_sha256).sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at))};
 });
 return{document:{id:doc.id,name:doc.name,version:doc.version,sha256:doc.sha256},coverage,units,running,reader_current:coverage?.reader_revision===READER_REVISION,warnings:[...new Set([...(cached?.warnings||[]),...(/\.docx?(?:\.p7m)?$/i.test(doc.name)||units.some(u=>/DOCX|DOC convertito/.test(u.method))?['Il testo Word è estratto dal corpo del documento. Intestazioni, piè di pagina, testo nelle immagini e impaginazione vanno controllati sull’originale.']:[])])],current:await ok(ctx.client.rpc('gare_source_current',{did:doc.id})),review_counts:{checked:units.filter(u=>u.reading_complete&&u.review?.status==='controllato').length,issues:units.filter(u=>u.review?.status==='problema').length,unread:units.filter(u=>!u.reading_complete).length,total:units.length}};
}
export async function reviewSourceText(ctx,doc,input){
 if(!['admin','editor','reviewer'].includes(ctx.role)){const error=Error('Permesso di controllo del testo richiesto');error.status=403;throw error;}
 const snapshot=await sourceText(ctx,doc),unit=snapshot.units.find(u=>u.key===input.unit_key);
 if(!snapshot.current)conflict('La fonte è storica: apri la versione corrente');
 if(!unit?.available||!unit.reading_complete||!snapshot.reader_current)conflict('Completa la lettura prima di registrare il controllo');
 if(unit.text_sha256!==input.extracted_sha256)conflict('La trascrizione è cambiata: rileggi il testo aggiornato prima di salvare');
 if((unit.review?.revision||0)!==input.expected_revision)conflict('Il controllo è stato aggiornato da un altro utente: ricarica la pagina');
 const patch={status:input.review_status,note:input.note,reviewed_by:ctx.userId};let result;
 if(unit.review){const{data,error}=await ctx.service.from('gare_source_reviews').update(patch).eq('id',unit.review.id).eq('company_id',ctx.companyId).eq('revision',input.expected_revision).select().maybeSingle();if(error)throw Error(error.message);if(!data)conflict('Il controllo è cambiato: ricarica prima di salvare');result=data;}
 else{const{data,error}=await ctx.service.from('gare_source_reviews').insert({...patch,company_id:ctx.companyId,document_id:doc.id,source_sha256:doc.sha256,unit_key:unit.key,extracted_sha256:unit.text_sha256}).select().single();if(error?.code==='23505')conflict('Un altro utente ha già registrato il controllo: ricarica la pagina');if(error)throw Error(error.message);result=data;}
 await ok(ctx.service.from('gare_audit').insert({company_id:ctx.companyId,actor:ctx.userId,entity_type:'gare_source_reviews',entity_id:result.id,action:unit.review?'UPDATE':'INSERT',details:{source_document_id:doc.id,before:unit.review,after:result,scope:'Controllo del testo estratto; nessuna approvazione dell’offerta'}}));
 return{review:result,original_preserved:true};
}
