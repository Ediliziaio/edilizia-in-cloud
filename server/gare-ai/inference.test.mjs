import test from 'node:test';import assert from 'node:assert/strict';
import { groundCitation,missingMarkers,retrieve } from './inference.mjs';
const id='11111111-1111-4111-8111-111111111111';const docs=[{id,sha256:'a'.repeat(64),version:2,name:'Disciplinare.pdf'}];const pages=[{document_id:id,page:4,section:'Punto 3',text:'Il sopralluogo è obbligatorio. La richiesta va inviata entro il 20 novembre 2026.'},{document_id:id,page:8,section:'Criteri',text:'La relazione tecnica deve seguire i criteri A e B.'}];
test('una citazione inventata non può essere importata',()=>assert.equal(groundCitation({document_id:id,page:4,section:'',quote:'La certificazione ISO 9001 è obbligatoria'},pages,docs).grounded,false));
test('un ID di documento di un altro contesto non viene accettato',()=>assert.equal(groundCitation({document_id:'other',page:4,section:'',quote:'Il sopralluogo è obbligatorio.'},pages,docs).grounded,false));
test('il riferimento di pagina viene ricavato dalla corrispondenza reale',()=>{const c=groundCitation({document_id:id,page:99,section:'inventata',quote:'Il sopralluogo è obbligatorio.'},pages,docs);assert.equal(c.grounded,true);assert.equal(c.page,4);assert.equal(c.version,2);assert.equal(c.section,'Punto 3');});
test('estratti troppo corti non costituiscono prova',()=>assert.equal(groundCitation({document_id:id,page:4,section:'',quote:'Il'},pages,docs).grounded,false));
test('segnaposto di fatti mancanti e impegni restano bloccanti',()=>assert.deepEqual(missingMarkers('[DA COMPLETARE: fatturato] testo [DA APPROVARE: nuovo personale] [DA COMPLETARE: fatturato]'),['[DA COMPLETARE: fatturato]','[DA APPROVARE: nuovo personale]']));
test('la ricerca privilegia i passaggi pertinenti alla domanda',()=>assert.equal(retrieve(pages,'Quali criteri della relazione tecnica?',100)[0].page,8));

test('date e ore sono ricavate dall’estratto e non dalla scheda gestionale',async()=>{
 const{criticalValues,groundResult}=await import('./inference.mjs');assert.deepEqual(criticalValues('Il termine è il 12 dicembre 2026, ore 12:30 Europe/Rome.'),{dates:['2026-12-12'],times:['12:30']});
 const text='La scadenza di presentazione è il 12 dicembre 2026.';const result=groundResult('analizza',{requirements:[],required_documents:[],deadlines:[{date:'2026-12-01',time:'12:00',citation:{document_id:id,page:1,quote:text}}]},[{document_id:id,page:1,text}],docs);
 assert.equal(result.deadlines[0].date,'2026-12-12');assert.equal(result.deadlines[0].time,null);assert.equal(result.deadlines[0].validation_notes.length,2);
});
test('date impossibili o più termini non diventano una scadenza unica',async()=>{const{criticalValues,groundResult}=await import('./inference.mjs');assert.deepEqual(criticalValues('31 febbraio 2026').dates,[]);const text='Termine modificato dal 12 dicembre 2026 al 18 dicembre 2026.';const r=groundResult('analizza',{requirements:[],required_documents:[],deadlines:[{date:'2026-12-18',time:null,citation:{document_id:id,page:1,quote:text}}]},[{document_id:id,page:1,text}],docs);assert.equal(r.deadlines[0].date,null);});
test('un singolo estratto non verifica una differenza fra due versioni',async()=>{const{groundResult}=await import('./inference.mjs');const r=groundResult('confronta',{changes:[{description:'Differenza non dimostrata',impact:'Da verificare',before_citation:{document_id:id,page:4,quote:'Il sopralluogo è obbligatorio.'},after_citation:null,citation:{document_id:id,page:4,quote:'Il sopralluogo è obbligatorio.'}}]},pages,docs);assert.equal(r.changes[0].comparison_verified,false);});
test('l’AI non associa automaticamente una prova generica al requisito',async()=>{const{groundResult}=await import('./inference.mjs');const r=groundResult('analizza',{requirements:[{evidence_id:'proof',citation:{document_id:id,page:4,quote:'Il sopralluogo è obbligatorio.'}}],required_documents:[],deadlines:[]},pages,docs,[{id:'proof'}]);assert.equal(r.requirements[0].evidence_id,null);assert.equal(r.requirements[0].suggested_evidence_id,'proof');});

test('uno scostamento UTC non viene scambiato per ora di presentazione',async()=>{const{criticalValues}=await import('./inference.mjs');assert.deepEqual(criticalValues('20 dicembre 2026, ore 12:30 (UTC+01:00)').times,['12:30']);});
test('contesti oltre la finestra verificata vengono rifiutati prima dell’inferenza',async()=>{const{infer}=await import('./inference.mjs');await assert.rejects(infer('rispondi','x'.repeat(20001),'domanda'),/Contesto troppo esteso/);});

test('una citazione negativa non diventa un obbligo positivo',async()=>{const{groundResult,excludesObligation}=await import('./inference.mjs');const quote="Non sono richieste un’offerta tecnica ed economica in questa fase.";const r=groundResult('analizza',{requirements:[{description:'Offerta tecnica ed economica',mandatory:true,citation:{document_id:id,page:1,quote}}],required_documents:[],deadlines:[]},[{document_id:id,page:1,text:quote}],docs);assert.equal(r.requirements.length,0);assert.match(r.risks[0],/esclusa/);assert.equal(excludesObligation('Importo non inferiore a 100.000 euro'),false);assert.equal(excludesObligation('Non è richiesta la garanzia provvisoria'),true);});

test('il budget della risposta include pagina, sezione e identificativi, anche in modalità rapida',async()=>{
 const{retrieveContext,contextText,contextLimit}=await import('./inference.mjs');const source=Array.from({length:38},(_,i)=>({document_id:'a'.repeat(36),version:1,page:i+1,section:'Pagina '+(i+1),text:('Termine presentazione offerte. ').repeat(160)}));const metadata='Dati gestionali: '+('x'.repeat(3000));const selected=retrieveContext(source,'Termine presentazione',contextLimit(false)-metadata.length-1);assert.ok(selected.length);assert.ok((metadata+'\n'+contextText(selected)).length<=contextLimit(false));assert.equal(selected[0].document_id,source[0].document_id);
});
test('il budget non produce segmenti vuoti né rimuove i riferimenti delle fonti',async()=>{
 const{retrieveContext,contextText}=await import('./inference.mjs');const source=[{document_id:'originale',version:3,page:7,section:'Titolo molto lungo '.repeat(80),text:'Testo originale non inventato'}];assert.deepEqual(retrieveContext(source,'testo',100),[]);const selected=retrieveContext(source,'testo',2000);assert.ok(contextText(selected).length<=2000);assert.equal(selected[0].page,7);assert.ok(selected[0].text.length);
});

test('la ricerca distingue una scadenza esplicita dai riferimenti generici alla piattaforma',async()=>{
 const{retrieveContext}=await import('./inference.mjs');const question='Qual è il termine ultimo per la presentazione delle offerte? Riporta la data e l’orario esatti presenti nel disciplinare e cita la fonte.';const source=[{document_id:'originale',version:1,page:1,section:'Pagina 1',text:'Oggetto dei lavori. '.repeat(130)+'Scadenza offerte: 16/11/2026 alle ore 10:00. '+ 'Istruzioni della procedura. '.repeat(50)},{document_id:'originale',version:1,page:2,section:'Pagina 2',text:('La piattaforma è accessibile fino al termine di presentazione delle offerte. La data e l’orario sono nel disciplinare. ').repeat(30)}];const selected=retrieveContext(source,question,4500);assert.ok(selected.some(p=>p.page===1&&p.text.includes('Scadenza offerte: 16/11/2026 alle ore 10:00.')));
});

test('la sintesi operativa distribuisce il contesto tra gli atti senza perdere i riferimenti', async () => {
 const { operationalPassages, contextText } = await import('./inference.mjs');
 const originals = [
  { id: 'dis', document_kind: 'disciplinare' },
  { id: 'ban', document_kind: 'bando' },
  { id: 'clar', document_kind: 'rettifica' },
  { id: 'extra', document_kind: 'allegato' },
 ];
 const pages = originals.slice(0,3).map((doc, index) => ({
  document_id: doc.id, version: 2, page: index + 1, section: 'Condizioni',
  text: 'Termine di presentazione delle offerte e requisiti di partecipazione. '.repeat(200),
 }));
 const selected = operationalPassages(pages, originals, 4000);
 assert.ok(contextText(selected).length <= 4000);
 assert.deepEqual(selected.map(p => [p.document_id, p.page, p.version]), [['dis',1,2],['ban',2,2],['clar',3,2]]);
});
