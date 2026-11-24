import { reviewRows } from './review/review-list';
import { latestDocuments } from './domain';
import type { DocumentRequest,GareDocument,Requirement } from './types';

export const tenderTabs=[{id:'panoramica',label:'Panoramica'},{id:'requisiti',label:'Requisiti'},{id:'documenti',label:'Documenti'},{id:'offerta',label:'Offerta'},{id:'attivita',label:'Attività'},{id:'ai',label:'Assistente AI'},{id:'revisioni',label:'Revisione e invio'}] as const;
export type TenderTab=typeof tenderTabs[number]['id'];
export const visibleTenderTabs=(started:boolean)=>tenderTabs.filter(t=>started||['panoramica','documenti'].includes(t.id));
export function tenderTab(requested:string|null,started:boolean):TenderTab{return visibleTenderTabs(started).find(t=>t.id===requested)?.id||'panoramica';}
export function tenderParams(current:URLSearchParams,patch:Record<string,string>){const next=new URLSearchParams(current);Object.entries(patch).forEach(([key,value])=>value?next.set(key,value):next.delete(key));return next;}
export const requirementOpen=(r:Requirement)=>!r.reviewed_by||!['compatibile','non_applicabile'].includes(r.status);
export const activeTenderDocuments=(docs:GareDocument[])=>latestDocuments(docs).filter(d=>!d.archived);
export function requestComplete(request:DocumentRequest,documents:GareDocument[]){return activeTenderDocuments(documents).some(d=>d.id===request.fulfilled_by&&d.category===request.category&&d.status==='approvato'&&!d.archived&&!d.unresolved_fields&&(!request.signature_required||d.signature_declared));}
export function filterRequirements(rows:Requirement[],query:string,state:string,lot:string){const text=query.trim().toLocaleLowerCase('it');return rows.filter(r=>(!text||`${r.description} ${r.expected_proof||''} ${r.note}`.toLocaleLowerCase('it').includes(text))&&(!state||(state==='aperte'?requirementOpen(r):r.status===state))&&(!lot||(lot==='comune'?!r.lot_id:r.lot_id===lot)));}
export function filterDocuments(rows:GareDocument[],query:string,category:string,state:string){return reviewRows(activeTenderDocuments(rows),[],query,'tutti').filter(d=>(!category||d.category===category)&&(!state||!['fonte','ricevuta'].includes(d.category)&&(state==='da_revisionare'?d.status!=='approvato':d.status===state)));}
