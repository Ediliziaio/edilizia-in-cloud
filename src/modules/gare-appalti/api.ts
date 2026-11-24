import type { SupabaseClient } from '@supabase/supabase-js';
import type { GareDocument, GareExport, Workspace } from './types';
import { safeFilename, sha256 } from './domain';

const tableMap = { companyAssets:'gare_company_assets', journeys:'gare_journeys',companyFacts:'gare_company_facts',communications:'gare_communications',technicalLibrary:'gare_technical_library',submissionLots:'gare_submission_lots', technicalCriteria:'gare_technical_criteria',evidenceFiles:'gare_evidence_files', tenders:'gare_tenders', lots:'gare_lots', participations:'gare_participations', evidence:'gare_evidence', documents:'gare_documents', requirements:'gare_requirements', tasks:'gare_tasks', exports:'gare_exports', submissions:'gare_submissions', participationLots:'gare_participation_lots', audit:'gare_audit',documentRequests:'gare_document_requests',drafts:'gare_ai_drafts',economicScenarios:'gare_economic_scenarios',savedSearches:'gare_saved_searches',preferences:'gare_tender_preferences' } as const;
export class GareApi {
 constructor(public client:SupabaseClient,public companyId:string) {}
 async workspace():Promise<Workspace> {
  const entries=await Promise.all(Object.entries(tableMap).map(async([key,table])=>{
   const collected:unknown[]=[];
   for(let offset=0;offset<50_000;offset+=1000){
    let query=this.client.from(table).select('*').eq('company_id',this.companyId);
    if(key==='audit')query=query.order('created_at',{ascending:false}).limit(100);
    else if(key==='participationLots')query=query.order('participation_id').order('lot_id').range(offset,offset+999);
    else query=query.order('id').range(offset,offset+999);
    const {data,error}=await query;if(error)throw error;collected.push(...(data??[]));
    if(key==='audit'||(data?.length??0)<1000)return [key,collected] as const;
   }
   throw new Error('Archivio molto esteso: è necessario restringere la consultazione. Nessun risultato parziale viene mostrato.');
  }));
  const workspace=Object.fromEntries(entries) as unknown as Workspace;const replaced=new Set(workspace.evidenceFiles.map(f=>f.previous_id).filter(Boolean));workspace.companyAssets=workspace.companyAssets?.map(a=>({...a,source_replaced:!!a.source_file_id&&replaced.has(a.source_file_id)}));return workspace;
 }
 async insert(table:keyof typeof tableMap,payload:Record<string,unknown>) {
  const {data,error}=await this.client.from(tableMap[table]).insert({...payload,company_id:this.companyId}).select().single();
  if(error) throw error; return data;
 }
 async update(table:keyof typeof tableMap,id:string,payload:Record<string,unknown>,revision?:number) {
  let q=this.client.from(tableMap[table]).update(payload).eq('company_id',this.companyId).eq('id',id);
  if(revision!==undefined) q=q.eq('revision',revision);
  const {data,error}=await q.select().maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('Questo elemento è cambiato oppure non è modificabile. Ricarica i dati prima di riprovare.');
  return data;
 }
 async blockers(id:string):Promise<string[]> {
  const {data,error}=await this.client.rpc('gare_blockers',{pid:id});
  if(error)throw error; return data??[];
 }
 async ai<T>(endpoint:string,body?:Record<string,unknown>):Promise<T>{return this.local<T>('ai',endpoint,body);}
 async local<T>(service:'ai'|'templates'|'sources'|'journey'|'preparation'|'intake'|'review'|'office',endpoint:string,body?:Record<string,unknown>):Promise<T>{
  const long=(service==='intake'&&['read','import'].includes(endpoint))||(service==='preparation'&&['start','resume','extract-company','review-draft','technical-draft'].includes(endpoint))||(service==='ai'&&['jobs','retry'].includes(endpoint));const{data,error}=long?await this.client.auth.refreshSession():await this.client.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Sessione scaduta.');
  const response=await fetch(`/api/gare/${service}/${endpoint}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch((): null => null);if(!response.ok||result===null)throw new Error(result?.error||'Elaborazioni Gare indisponibili');return result;
 }
 async startParticipation(tenderId:string,lotIds:string[],responsible:string,reason:string) {
  const {data,error}=await this.client.rpc('gare_start_participation',{tender: tenderId,lot_ids:lotIds,owner_name:responsible,reason});
  if(error)throw error;return data as string;
 }
 async upload(file:File,payload:Record<string,unknown>,table:'documents'|'evidenceFiles'='documents') {
  const max=table==='documents'&&payload.category==='fonte'?50:20;
  if(file.size<1||file.size>max*1024*1024) throw new Error(`Il file deve essere compreso tra 1 byte e ${max} MB.`);
  const content=await file.arrayBuffer();const hash=await sha256(content);
  if(!payload.previous_id){let existing=this.client.from(tableMap[table]).select('*').eq('company_id',this.companyId).eq('sha256',hash);if(table==='documents'){existing=existing.eq('tender_id',payload.tender_id).eq('category',payload.category);existing=payload.participation_id?existing.eq('participation_id',payload.participation_id):existing.is('participation_id',null);existing=payload.lot_id?existing.eq('lot_id',payload.lot_id):existing.is('lot_id',null);}else existing=existing.eq('evidence_id',payload.evidence_id);const{data,error}=await existing.order('version',{ascending:false}).limit(1);if(error)throw error;if(data?.[0]){const{data:newer,error:nextError}=await this.client.from(tableMap[table]).select('id').eq('previous_id',data[0].id).limit(1);if(nextError)throw nextError;if(table==='documents'&&newer?.length)throw new Error('Il file corrisponde a una versione storica. Apri il documento corrente e usa Carica nuova versione.');if(table==='documents'&&data[0].archived)throw new Error('Questo file è già conservato tra gli esclusi. Apri Storico e scegli Carica nuova versione per riutilizzarlo con una nuova revisione.');if(!newer?.length){if(table==='documents'&&['document_kind','mandatory','signature_required','signature_declared'].some(k=>payload[k]!==undefined&&payload[k]!==data[0][k]))throw new Error('File già acquisito con dati diversi. Usa Nuova versione per revisionare tipo, obblighi o firma dichiarata.');return data[0];}}}
  const storage_path=`${this.companyId}/${crypto.randomUUID()}/${safeFilename(file.name)}`;
  const {error}=await this.client.storage.from('gare-private').upload(storage_path,content,{contentType:file.type||'application/octet-stream',upsert:false});
  if(error)throw error;
  try {return await this.insert(table,{...payload,name:file.name,storage_path,sha256:hash,size_bytes:file.size});}
  catch(error) {throw new Error(`File acquisito ma metadati non salvati. L’originale resta conservato; riprova il caricamento. ${error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?String(error.message):String(error)}`, { cause: error });}
 }
 async blob(document:Pick<GareDocument,'storage_path'|'sha256'>) {
  const {data,error}=await this.client.storage.from('gare-private').download(document.storage_path);
  if(error)throw error;
  if(await sha256(await data.arrayBuffer())!==document.sha256) throw new Error('Hash del file diverso dall’originale. Esportazione interrotta.');
  return data;
 }
 async buildExport(participationId:string,draft:boolean) {
  const exported=await this.insert('exports',{participation_id:participationId,draft}) as GareExport;
  return this.exportBlob(exported);
 }
 async exportBlob(exported:GareExport) {
  const {default:JSZip}=await import('jszip');
  const zip=new JSZip();
  const docs=exported.manifest.documents;
  for(const doc of docs) {
   const blob=await this.blob(doc);
   zip.file(`${doc.category}/${doc.id.slice(0,8)}_v${doc.version}_${safeFilename(doc.name)}`,await blob.arrayBuffer());
  }
  for(const file of exported.manifest.evidence_files||[]){const blob=await this.blob(file);zip.file(`prove_impresa/${file.id.slice(0,8)}_v${file.version}_${safeFilename(file.name)}`,await blob.arrayBuffer());}
  zip.file('manifest.json',JSON.stringify({...exported.manifest,export_id:exported.id,created_at:exported.created_at},null,2));
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  zip.file('INDICE.html',`<!doctype html><html lang="it"><meta charset="utf-8"><title>Indice fascicolo</title><body><h1>${exported.draft?'BOZZA — ':''}${escape(exported.manifest.tender.title)}</h1><p>Pacchetto interno. L’esportazione non costituisce presentazione sul portale.</p><p>ID ${exported.id} · ${escape(exported.created_at)}</p><ul>${docs.map(d=>`<li>${escape(d.category)} · ${escape(d.name)} · versione ${d.version} · ${escape(d.status)} · SHA-256 ${d.sha256}</li>`).join('')}</ul></body></html>`);
  return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE'}),name:`${exported.draft?'BOZZA_':''}Fascicolo_${exported.id.slice(0,8)}.zip`,exported};
 }
}
export function downloadBlob(blob:Blob,name:string) {
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=safeFilename(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
