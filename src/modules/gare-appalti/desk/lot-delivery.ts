import { phaseForKind } from '../journey/model';
import { activeTenderDocuments } from '../tender-ux';
import type { DocumentRequest, GareDocument, Lot, Participation, Workspace } from '../types';

type FileStatus = 'mancante' | 'ricollega' | 'bozza' | 'revisione' | 'incompleto' | 'profilo_dgue' | 'approvato';
type SignatureStatus = 'da_firmare' | 'dichiarata' | 'non_indicata';
type UploadStatus = 'da_completare' | 'da_esportare' | 'in_pacchetto' | 'dichiarato' | 'con_ricevuta';

export interface DeliveryRow {
 id: string;
 category: GareDocument['category'];
 title: string;
 document?: GareDocument;
 request?: DocumentRequest;
 file: FileStatus;
 signature: SignatureStatus;
 upload: UploadStatus;
 sourceChanged: boolean;
}

export function documentAppliesToLot(doc: GareDocument, lot: Lot, history: GareDocument[] = []) {
 if (doc.lot_id && doc.lot_id !== lot.id) return false;
 let source: GareDocument | undefined = doc;
 while (source) {
  const xmlLots = source.generation_snapshot?.lot_ids;
  if (Array.isArray(xmlLots)) return xmlLots.includes(lot.code) || xmlLots.includes(lot.id);
  const prior = source.previous_id;
  const version: number = source.version;
  source = prior ? history.find(d => d.id === prior && d.version < version) : undefined;
 }
 return true;
}

export function lotDelivery(data: Workspace, p: Participation, lot: Lot) {
 const current = activeTenderDocuments(data.documents.filter(d=>d.tender_id===p.tender_id));
 const originals = new Set(current.filter(d=>d.category==='fonte').map(d=>d.id));
 const files = current.filter(d=>d.participation_id===p.id && !['fonte','ricevuta'].includes(d.category)
  && !(/\.json$/i.test(d.name)&&d.generation_snapshot?.answers) && documentAppliesToLot(d,lot,data.documents));
 const fileIndex = new Map(files.map(d=>[d.id,d]));
 const requests = data.documentRequests.filter(r=>r.participation_id===p.id&&(!r.lot_id||r.lot_id===lot.id));
 const finals = data.exports.filter(e=>e.participation_id===p.id&&!e.draft&&e.manifest?.lots?.some(l=>l.id===lot.id));
 const phase = data.journeys?.find(j=>j.participation_id===p.id)?.configuration.phase
  || phaseForKind(data.tenders.find(t=>t.id===p.tender_id)?.kind || 'gara_aperta');
 const submitted = (data.submissionLots||[]).filter(s=>s.participation_id===p.id&&s.lot_id===lot.id&&s.phase===phase&&['dichiarata','con_ricevuta'].includes(s.state));
 const activeSubmissions = data.submissions.filter(s=>s.participation_id===p.id&&submitted.some(l=>l.submission_id===s.id));
 const linked = new Set<string>();
 const nextVersion = new Map(data.documents.filter(d=>d.tender_id===p.tender_id&&d.participation_id===p.id&&d.previous_id)
  .map(d=>[d.previous_id!,d]));

 function currentReplacement(id: string | null) {
  if(!id)return;
  const found=new Set([id]);
  let next=nextVersion.get(id);
  while(next&&!found.has(next.id)){
   if(fileIndex.has(next.id))return next;
   found.add(next.id);
   next=nextVersion.get(next.id);
  }
 }

 function row(request?: DocumentRequest, doc?: GareDocument, relink=false): DeliveryRow {
  if (doc) linked.add(doc.id);
  const signature: SignatureStatus = doc?.signature_declared ? 'dichiarata'
   : request?.signature_required||doc?.signature_required ? 'da_firmare' : 'non_indicata';
  const validation = doc?.generation_snapshot?.validation as { official?: { status?: string; european_rules_passed?: boolean } } | undefined;
  const portalReview = validation?.official?.status === 'needs_review' && validation.official.european_rules_passed !== true;
  const file: FileStatus = !doc ? 'mancante' : relink ? 'ricollega' : portalReview ? 'profilo_dgue' : doc.unresolved_fields ? 'incompleto'
   : doc.status==='approvato' ? 'approvato' : doc.status==='in_verifica' ? 'revisione' : 'bozza';
  const docSource = doc?.generation_snapshot?.source_id;
  const sourceChanged = !!request?.source_document_id&&!originals.has(request.source_document_id)
   || typeof docSource==='string'&&!originals.has(docSource);
  const packages = doc ? finals.filter(e=>e.manifest.documents?.some(item=>item.id===doc.id&&item.sha256===doc.sha256)) : [];
  const receipt = activeSubmissions.find(s=>packages.some(e=>e.id===s.export_id));
  const status = receipt&&submitted.find(s=>s.submission_id===receipt.id);
  const upload: UploadStatus = status?.state==='con_ricevuta'||status?.receipt_id ? 'con_ricevuta'
   : status ? 'dichiarato'
   : file!=='approvato'||signature==='da_firmare'||sourceChanged ? 'da_completare'
   : packages.length ? 'in_pacchetto' : 'da_esportare';
  return {
   id:request?.id||doc!.id, category:request?.category||doc!.category, title:request?.title||doc!.name,
   document:doc, request, file, signature, upload, sourceChanged,
  };
 }

 const rows = requests.map(r=>{
  const candidate = r.fulfilled_by ? fileIndex.get(r.fulfilled_by) : undefined;
  if(candidate?.category===r.category)return row(r,candidate);
  const replacement=currentReplacement(r.fulfilled_by);
  return replacement?.category===r.category ? row(r,replacement,true) : row(r);
 });
 for(const doc of files) if(!linked.has(doc.id)) rows.push(row(undefined,doc));
 return { rows, requests:requests.length, unassignedSubmissions:data.submissions.some(s=>s.participation_id===p.id
  && !(data.submissionLots||[]).some(l=>l.submission_id===s.id)) };
}
