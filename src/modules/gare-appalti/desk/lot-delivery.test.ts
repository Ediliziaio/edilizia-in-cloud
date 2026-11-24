import { expect, it } from 'vitest';
import type { GareDocument, Lot, Participation, Workspace } from '../types';
import { lotDelivery } from './lot-delivery';

const p = { id: 'p', tender_id: 't' } as Participation;
const l1 = { id: 'l1', code: 'LOT-0001', tender_id: 't' } as Lot;
const l2 = { id: 'l2', code: 'LOT-0002', tender_id: 't' } as Lot;
const doc: GareDocument = {
 id:'xml', company_id:'company', tender_id:'t', participation_id:'p', lot_id:null, version:1, category:'amministrativa',
 name:'DGUE.xml', storage_path:'company/DGUE.xml', size_bytes:200, document_kind:'modello_compilato', previous_id:null,
 status:'approvato', sha256:'a', mandatory:true, signature_required:true, signature_declared:false,
 generation_snapshot:{ lot_ids:['LOT-0001'] }, approved_by:'reviewer', approved_at:null, created_at:'2026-11-21',
};
function workspace(): Workspace {
 return {
  tenders: [], participations: [p], lots: [l1,l2], participationLots: [],
  documents: [doc], documentRequests: [], requirements: [], tasks: [], exports: [], submissions: [],
  evidence: [], audit: [], technicalCriteria: [], drafts: [], evidenceFiles: [], economicScenarios: [], savedSearches: [], preferences: [],
 };
}
it('mantiene il lotto del DGUE anche quando viene caricata una versione firmata senza il modello di compilazione', () => {
 const data = workspace();
 const signed = { ...doc, id: 'signed', previous_id: doc.id, version: 2, generation_snapshot: {}, signature_declared: true };
 data.documents.push(signed);
 expect(lotDelivery(data,p,l1).rows[0]).toMatchObject({ document: signed, signature: 'dichiarata', upload: 'da_esportare' });
 expect(lotDelivery(data,p,l2).rows).toEqual([]);
});
it('mostra la richiesta senza file se il collegamento riguarda un altro lotto', () => {
 const data = workspace();
 data.documentRequests = [{ id:'r', title:'DGUE richiesto', participation_id:'p', lot_id:'l2', category:'amministrativa',
  fulfilled_by:doc.id, signature_required:true }] as Workspace['documentRequests'];
 expect(lotDelivery(data,p,l2).rows).toMatchObject([{ file:'mancante', signature:'da_firmare', upload:'da_completare' }]);
});
it('lega presentazione e ricevuta alla fase, al lotto e alla stessa versione del pacchetto finale', () => {
 const data = workspace();
 const signed = { ...doc, signature_declared: true };
 data.documents = [signed];
 data.exports = [
  { id:'draft', participation_id:'p', draft:true, manifest:{ lots:[l1], documents:[signed] } },
  { id:'old', participation_id:'p', draft:false, manifest:{ lots:[l1], documents:[{ ...signed, sha256:'older' }] } },
  { id:'other', participation_id:'p', draft:false, manifest:{ lots:[l2], documents:[signed] } },
 ] as Workspace['exports'];
 expect(lotDelivery(data,p,l1).rows[0].upload).toBe('da_esportare');
 data.exports.push({ id:'final', participation_id:'p', draft:false, manifest:{ lots:[l1,l2], documents:[signed] } } as Workspace['exports'][number]);
 data.submissions = [{ id:'s', participation_id:'p', export_id:'final' }] as Workspace['submissions'];
 expect(lotDelivery(data,p,l1)).toMatchObject({ rows:[{ upload:'in_pacchetto' }], unassignedSubmissions:true });
 data.submissionLots = [{ id:'sl', submission_id:'s', participation_id:'p', lot_id:'l1', phase:'interesse', state:'con_ricevuta' }] as Workspace['submissionLots'];
 expect(lotDelivery(data,p,l1).rows[0].upload).toBe('in_pacchetto');
 data.submissionLots![0].phase = 'offerta';
 expect(lotDelivery(data,p,l1).rows[0].upload).toBe('con_ricevuta');
});

it('distingue il DGUE strutturalmente valido che attende il controllo del profilo della procedura', () => {
 const data=workspace();
 data.documents=[{...doc, unresolved_fields:1, status:'in_verifica', generation_snapshot:{
  ...doc.generation_snapshot, validation:{official:{status:'needs_review',european_rules_passed:false}},
 }}];
 expect(lotDelivery(data,p,l1).rows[0]).toMatchObject({file:'profilo_dgue',signature:'da_firmare',upload:'da_completare'});
});

it('mostra una nuova versione approvata da ricollegare senza duplicare la riga o considerare compilata la richiesta', () => {
 const data=workspace();
 data.documents.push({...doc,id:'v2',previous_id:doc.id,version:2,signature_declared:true});
 data.documentRequests=[{id:'r',title:'DGUE firmato',participation_id:'p',lot_id:'l1',category:'amministrativa',
  fulfilled_by:doc.id,signature_required:true}] as Workspace['documentRequests'];
 expect(lotDelivery(data,p,l1).rows).toMatchObject([{file:'ricollega',document:{id:'v2'},upload:'da_completare'}]);
 expect(lotDelivery(data,p,l2).rows).toEqual([]);
});
