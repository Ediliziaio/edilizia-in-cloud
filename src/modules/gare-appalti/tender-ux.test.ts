import { describe,expect,it } from 'vitest';
import { activeTenderDocuments,filterDocuments,filterRequirements,requestComplete,requirementOpen,tenderParams,tenderTab,visibleTenderTabs } from './tender-ux';
import type { DocumentRequest,GareDocument,Requirement } from './types';
describe('schede operative della gara',()=>{
 it('mostra solo le sezioni utilizzabili prima dell’avvio della partecipazione',()=>{expect(visibleTenderTabs(false).map(t=>t.id)).toEqual(['panoramica','documenti']);expect(tenderTab('ai',false)).toBe('panoramica');expect(tenderTab('ai',true)).toBe('ai');expect(tenderTab('sconosciuta',true)).toBe('panoramica');});
 it('conserva filtri e busta quando si cambia scheda senza alterare i parametri precedenti',()=>{const old=new URLSearchParams({tab:'requisiti',requisiti_stato:'aperte',documenti_q:'Scuola & impresa',busta:'tecnica'});const next=tenderParams(old,{tab:'documenti',documenti_vista:'checklist'});expect(next.get('requisiti_stato')).toBe('aperte');expect(next.get('busta')).toBe('tecnica');expect(next.get('documenti_q')).toBe('Scuola & impresa');expect(old.get('tab')).toBe('requisiti');expect(tenderParams(next,{documenti_q:''}).has('documenti_q')).toBe(false);});
 it('non chiude una verifica per il solo stato compatibile senza revisore',()=>{expect(requirementOpen({status:'compatibile',reviewed_by:null} as Requirement)).toBe(true);expect(requirementOpen({status:'non_applicabile',reviewed_by:'reviewer'} as Requirement)).toBe(false);});
 it('combina ricerca, stato aperto e lotto senza includere requisiti di altri lotti',()=>{const rows=[{id:'1',description:'SOA OG1',note:'',status:'compatibile',reviewed_by:null,lot_id:'A'},{id:'2',description:'SOA OG1',note:'',status:'da_verificare',lot_id:'B'},{id:'3',description:'Certificato',expected_proof:'SOA',note:'',status:'compatibile',reviewed_by:'r',lot_id:null}] as Requirement[];expect(filterRequirements(rows,'soa','aperte','A').map(r=>r.id)).toEqual(['1']);expect(filterRequirements(rows,'soa','','comune').map(r=>r.id)).toEqual(['3']);});
 it('esclude versioni superate e archiviati da ricerca e conteggi',()=>{const rows=[{id:'old',name:'Relazione.docx',category:'tecnica',status:'approvato'},{id:'new',previous_id:'old',name:'Relazione.docx',category:'tecnica',status:'bozza'},{id:'archived',name:'Relazione.pdf',category:'tecnica',status:'approvato',archived:true}] as GareDocument[];expect(activeTenderDocuments(rows).map(d=>d.id)).toEqual(['new']);expect(filterDocuments(rows,'RELAZIONE','tecnica','da_revisionare').map(d=>d.id)).toEqual(['new']);expect(filterDocuments(rows,'','','approvato')).toEqual([]);});
 it('non tratta gli originali sorgente come bozze dell’offerta da revisionare',()=>{const rows=[{id:'s',name:'Disciplinare.pdf',category:'fonte',status:'bozza'}] as GareDocument[];expect(filterDocuments(rows,'','','bozza')).toEqual([]);expect(filterDocuments(rows,'','fonte','')).toHaveLength(1);});
 it('richiede approvazione, dati completi e firma dichiarata per completare una richiesta',()=>{const r={fulfilled_by:'d',category:'tecnica',signature_required:true} as DocumentRequest;const d={id:'d',category:'tecnica',status:'approvato',signature_declared:true} as GareDocument;expect(requestComplete(r,[d])).toBe(true);expect(requestComplete(r,[{...d,unresolved_fields:1}])).toBe(false);expect(requestComplete(r,[{...d,signature_declared:false}])).toBe(false);expect(requestComplete(r,[{...d,category:'economica'}])).toBe(false);expect(requestComplete(r,[d,{...d,id:'new',previous_id:'d',status:'bozza'}])).toBe(false);});
 it('ritrova file omonimi per operatore e titolo leggibile mantenendo categoria, stato e versione corrente',()=>{
  const rows=[
   {id:'old',name:'BOZZA_DGUE_Response.xml',category:'amministrativa',status:'bozza',generation_snapshot:{dgue_case_id:'c',identity:{name:'Edilità Partner',tax_id:'IT-PARTNER'}}},
   {id:'new',previous_id:'old',name:'BOZZA_DGUE_Response.xml',category:'amministrativa',status:'in_verifica',generation_snapshot:{dgue_case_id:'c',identity:{name:'Edilità Partner',tax_id:'IT-PARTNER'}}},
   {id:'other',name:'BOZZA_DGUE_Response.xml',category:'amministrativa',status:'in_verifica',generation_snapshot:{dgue_case_id:'b',identity:{name:'Altra impresa',tax_id:'IT-OTHER'}}},
   {id:'word',name:'BOZZA_compilata_LAB_Modulo_operatore_B.docx',category:'amministrativa',status:'in_verifica'}
  ] as unknown as GareDocument[];
  expect(filterDocuments(rows,'edilita partner','amministrativa','in_verifica').map(d=>d.id)).toEqual(['new']);
  expect(filterDocuments(rows,'it-partner','','approvato')).toEqual([]);
  expect(filterDocuments(rows,'it-partner','tecnica','')).toEqual([]);
  expect(filterDocuments(rows,'Modulo operatore B','','').map(d=>d.id)).toEqual(['word']);
  expect(filterDocuments(rows,'BOZZA_DGUE_Response.xml','','').map(d=>d.id)).toEqual(['new','other']);
 });
});
