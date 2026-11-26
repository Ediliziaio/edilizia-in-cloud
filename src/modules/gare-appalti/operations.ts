import { dateLabel,evidenceValidAt,latestDocuments } from './domain';
import type { Participation,Tender,Workspace } from './types';

const closed=new Set(['non_partecipare','ritirata','esito']);
export const isActiveParticipation=(p:Participation)=>!closed.has(p.stage);
export function calendarDate(now:Date,timezone='Europe/Rome'){
 return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
const quantity=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const openRequirement=(r:Workspace['requirements'][number])=>!r.reviewed_by||!['compatibile','non_applicabile'].includes(r.status);
const dayDistance=(from:string,to:string)=>Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000);
export function deadlineState(t:Tender,now:Date){
 const today=calendarDate(now,t.timezone);const days=t.deadline_date?dayDistance(today,t.deadline_date):null;
 if(!t.deadline_date)return {days,expired:false,unknown:true,label:'Data da verificare'};
 if(!t.deadline_time)return {days,expired:days!<0,unknown:true,label:days!<0?'Data trascorsa · ora sconosciuta':'Orario da verificare'};
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:t.timezone,hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
 const expired=t.deadline_utc_offset!=null
  ?Date.parse(`${t.deadline_date}T${t.deadline_time.padEnd(8,':00')}Z`)-t.deadline_utc_offset*60000<=now.getTime()
  :`${t.deadline_date} ${t.deadline_time}`<=`${today} ${parts}`;
 return {days,expired,unknown:false,label:expired?'Termine trascorso':days===0?`Oggi · ${t.deadline_time.slice(0,5)}`:days===1?`Domani · ${t.deadline_time.slice(0,5)}`:dateLabel(t.deadline_date)};
}
export interface Priority {id:string;kind:'termine'|'attivita'|'evidenza'|'documento'|'requisito'|'decisione'|'comunicazione';title:string;context:string;detail:string;badge:string;urgent:boolean;to:string;action:string;rank:number;date:string}
export function todayPriorities(data:Workspace,now=new Date()):Priority[]{
 const today=calendarDate(now);const candidates:Priority[]=[];
 const active=data.participations.filter(p=>isActiveParticipation(p)&&p.stage!=='presentata');
 const activeById=new Map(active.map(p=>[p.id,p]));
 const tenders=new Map(data.tenders.map(t=>[t.id,t]));
 const url=(p:Participation,tab:string)=>`/azienda/gare/partecipazioni/${p.id}?tab=${tab}`;
 for(const p of active){const t=tenders.get(p.tender_id);if(!t)continue;const due=deadlineState(t,now);
  if(due.unknown||due.days!<=7)candidates.push({id:`termine:${p.id}`,kind:'termine',title:due.expired?'Verifica la gara con termine trascorso':due.unknown?'Conferma il termine ufficiale':'Prepara la presentazione',context:t.title,detail:due.unknown?'Confronta data e ora con l’ultimo avviso.':`Termine ${dateLabel(t.deadline_date)} · ${t.deadline_time!.slice(0,5)} · ${t.timezone}`,badge:due.label,urgent:due.expired||due.days===0,to:due.unknown||due.expired?`/azienda/gare/procedure/${t.id}/modifica`:url(p,'revisioni'),action:due.unknown||due.expired?'Verifica termine':'Apri controlli',rank:due.expired||due.days===0?0:due.unknown?3:due.days!<=2?1:5,date:t.deadline_date||today});
  if(p.decision==='approfondisci')candidates.push({id:`decisione:${p.id}`,kind:'decisione',title:'Conferma la decisione dell’impresa',context:t.title,detail:'La partecipazione è ancora in valutazione.',badge:'Decisione aperta',urgent:false,to:url(p,'panoramica'),action:'Apri valutazione',rank:7,date:today});
 }
 for(const task of data.tasks){const p=activeById.get(task.participation_id);if(!p||task.completed)continue;const days=dayDistance(today,task.due_date);if(days>7)continue;
  candidates.push({id:`attivita:${task.id}`,kind:'attivita',title:task.title,context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:`${task.responsible} · ${task.kind}`,badge:days<0?'Attività arretrata':days===0?'Da fare oggi':dateLabel(task.due_date),urgent:days<=0,to:url(p,'attivita'),action:'Apri attività',rank:days<=0?1:4,date:task.due_date});
 }
 for(const evidence of data.evidence){
  if(evidence.status==='non_applicabile')continue;
  const uses=data.requirements.filter(r=>r.evidence_id===evidence.id&&r.status!=='non_applicabile'&&activeById.has(r.participation_id));
  const affected=uses.find(r=>{const p=activeById.get(r.participation_id)!;return !evidenceValidAt(evidence.status,evidence.expires_on,evidence.verified_on,tenders.get(p.tender_id)?.deadline_date||today);});
  const expired=!!evidence.expires_on&&evidence.expires_on<today;
  const expiring=!!evidence.expires_on&&dayDistance(today,evidence.expires_on)<=7;
  if(!affected&&!expired&&!expiring)continue;
  const p=affected?activeById.get(affected.participation_id):undefined;
  candidates.push({id:`evidenza:${evidence.id}`,kind:'evidenza',title:`Aggiorna ${evidence.title}`,context:p?tenders.get(p.tender_id)?.title||'Fascicolo':'Fascicolo impresa',detail:affected?'La prova collegata richiede verifica per questa gara.':`Scadenza ${dateLabel(evidence.expires_on)}`,badge:expired?'Evidenza scaduta':affected?'Prova da verificare':'In scadenza',urgent:expired,to:'/azienda/gare?sezione=fascicolo',action:'Apri evidenza',rank:expired?2:affected?3:5,date:evidence.expires_on||today});
 }
 const documents=latestDocuments(data.documents).filter(d=>!d.archived);
 for(const d of documents){const p=d.participation_id?activeById.get(d.participation_id):undefined;if(!p||['fonte','ricevuta'].includes(d.category)||d.status==='approvato')continue;
  candidates.push({id:`documento:${d.id}`,kind:'documento',title:d.unresolved_fields?'Completa la bozza prima della revisione':'Revisiona il documento',context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:d.name,badge:d.unresolved_fields?`${d.unresolved_fields} dati aperti`:d.status==='in_verifica'?'In attesa di approvazione':'Bozza da rivedere',urgent:false,to:d.ai_draft_id?`/azienda/gare/partecipazioni/${p.id}/documenti/${d.ai_draft_id}`:url(p,'documenti'),action:d.ai_draft_id?'Apri editor':'Apri documento',rank:4,date:today});
 }
 for(const request of data.documentRequests){const p=activeById.get(request.participation_id);if(!p||documents.some(d=>d.id===request.fulfilled_by&&d.status==='approvato'))continue;
  // A pending file already has a specific review action above.
  if(documents.some(d=>d.id===request.fulfilled_by))continue;
  const overdue=!!request.due_date&&request.due_date<=today;
  candidates.push({id:`richiesta:${request.id}`,kind:'documento',title:`Prepara ${request.title}`,context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:request.responsible||'Responsabile da assegnare',badge:overdue?'Preparazione in scadenza':'Documento mancante',urgent:overdue,to:url(p,'documenti'),action:'Apri checklist',rank:overdue?1:6,date:request.due_date||today});
 }
 for(const p of active){const rows=data.requirements.filter(r=>r.participation_id===p.id&&openRequirement(r));if(!rows.length)continue;
  candidates.push({id:`requisiti:${p.id}`,kind:'requisito',title:`Verifica ${quantity(rows.length,'requisito aperto','requisiti aperti')}`,context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:'Confronta le condizioni con fonti e prove aziendali.',badge:'Verifica manuale',urgent:false,to:url(p,'requisiti'),action:'Apri requisiti',rank:6,date:today});
 }
 for(const c of data.communications||[]){if(c.status==='chiusa')continue;const p=data.participations.find(p=>p.id===c.participation_id);if(!p)continue;const days=c.due_date?dayDistance(today,c.due_date):null;candidates.push({id:`comunicazione:${c.id}`,kind:'comunicazione',title:c.title,context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:`${c.responsible} · ${c.status==='in_attesa'?'In attesa di terzi':c.kind}`,badge:days===null?'Termine da verificare':days<0?'Risposta arretrata':days===0?'Rispondi oggi':dateLabel(c.due_date),urgent:days!==null&&days<=0,to:`/azienda/gare/partecipazioni/${p.id}/prepara?vista=comunicazioni`,action:'Gestisci richiesta',rank:days!==null&&days<=0?0:c.blocking?1:4,date:c.due_date||today});}
 for(const j of data.journeys||[])for(const e of j.extras){if(!e.due_date||['done','na'].includes(j.confirmations[e.id]?.status))continue;const p=data.participations.find(p=>p.id===j.participation_id);if(!p)continue;const days=dayDistance(today,e.due_date);if(days>7)continue;candidates.push({id:`passaggio:${e.id}`,kind:'attivita',title:e.title,context:tenders.get(p.tender_id)?.title||'Fascicolo',detail:e.responsible||p.responsible,badge:days<=0?'Passaggio in scadenza':dateLabel(e.due_date),urgent:days<=0,to:`/azienda/gare/partecipazioni/${p.id}/prepara?fase=${e.stage}`,action:'Apri passaggio',rank:days<=0?1:4,date:e.due_date});}
 const seen=new Set<string>();const documentsById=new Map(documents.map(d=>[d.id,d]));
 return candidates.sort((a,b)=>a.rank-b.rank||a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).filter(item=>{const doc=item.id.startsWith('documento:')?documentsById.get(item.id.slice(10)):undefined;const key=doc?.ai_draft_id?`bozza:${doc.ai_draft_id}`:item.id;if(seen.has(key))return false;seen.add(key);return true;});
}
export function workflowSteps(data:Workspace,p:Participation,blockers?:string[]){
 const docs=latestDocuments(data.documents).filter(d=>!d.archived&&d.participation_id===p.id&&!['fonte','ricevuta'].includes(d.category));
 const requests=data.documentRequests.filter(r=>r.participation_id===p.id&&!docs.some(d=>d.id===r.fulfilled_by&&d.status==='approvato'));
 const requirements=data.requirements.filter(r=>r.participation_id===p.id&&openRequirement(r));
 const tasks=data.tasks.filter(t=>t.participation_id===p.id&&!t.completed);
 const submissions=data.submissions.filter(s=>s.participation_id===p.id);
 return [
  {label:'Valutazione',tab:p.decision==='approfondisci'?'panoramica':'requisiti',detail:p.decision==='approfondisci'?'Decisione da confermare':data.requirements.some(r=>r.participation_id===p.id)?quantity(requirements.length,'requisito aperto','requisiti aperti'):'Requisiti da censire'},
  {label:'Preparazione',tab:'documenti',detail:requests.length?quantity(requests.length,'documento da completare','documenti da completare'):docs.length?`${docs.filter(d=>d.status!=='approvato').length} file da revisionare`:'Documenti da predisporre'},
  {label:'Revisione',tab:'revisioni',detail:blockers?`${quantity(blockers.length,'controllo','controlli')} · ${quantity(tasks.length,'attività aperta','attività aperte')}`:'Controlli da verificare'},
  {label:'Caricamento',tab:'revisioni',detail:submissions.length?submissions.some(s=>s.receipt_id)?'Ricevuta acquisita':'Invio dichiarato · senza ricevuta':data.exports.some(e=>e.participation_id===p.id&&!e.draft)?'Pacchetto finale disponibile':'Presentazione da registrare'},
  {label:'Esito',tab:'revisioni',detail:p.stage==='esito'?'Esito registrato':p.stage==='ritirata'?'Partecipazione ritirata':p.stage==='non_partecipare'?'Decisione: non partecipare':'In attesa di esito'},
 ];
}
export function workflowIndex(p:Participation){return ({in_valutazione:0,in_preparazione:1,in_revisione:2,pronta:3,presentata:3,esito:4,ritirata:-1,non_partecipare:-1})[p.stage];}
