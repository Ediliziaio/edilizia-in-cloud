import test from'node:test';import assert from'node:assert/strict';import{matchAssets,selectKnowledge,usableAsset}from'./knowledge.mjs';import{canonicalField,commonFieldKey}from'../../src/modules/gare-appalti/dossier/field-key.js';
import{checkedProposal}from'./proposal.mjs';
import{formSuggestions,usedFormAssets}from'./form-data.mjs';
const asset={id:'a',revision:2,status:'confermato',reviewed_by:'r',verified_on:'2025-01-01',expires_on:null,kind:'qualification',title:'Attestazione SOA OG1',entity_name:'Impresa altra da verificare',entity_tax_id:'ALTRA',data:{scheme:'SOA',category:'OG1',classification:'III'}};
test('Moduli: suggerimenti con titolare e fonte, snapshot solo sui dati selezionati ancora coerenti',()=>{
 const fields=[{key:'cc_0',label:'Categoria SOA',supported:true},{key:'cc_1',label:'Nome',supported:true},{key:'cc_2',label:'Categoria SOA',supported:true,options:['A','B']}];const suggestions=formSuggestions(fields,[asset]);assert.equal(suggestions.cc_0[0].entity_tax_id,'ALTRA');assert.deepEqual(suggestions.cc_1,[]);assert.equal(suggestions.cc_2,undefined);
 assert.equal(usedFormAssets(fields,{cc_0:'OG1'},{cc_0:'a'},[asset])[0].revision,2);assert.throws(()=>usedFormAssets(fields,{cc_0:'OG2'},{cc_0:'a'},[asset]),/cambiato/);assert.deepEqual(usedFormAssets(fields,{cc_0:'OG1'},{},[asset]),[]);
});
test('Estrazione scarta schede vuote e dati inventati, mantenendo valori espliciti',()=>{
 const text='Impresa QA Srl. Attestazione SOA: categoria OG1, classifica III.';const citation={quote:'Attestazione SOA: categoria OG1, classifica III.'};
 const p=checkedProposal({kind:'qualification',title:'SOA',entity_name:'Impresa QA Srl',entity_tax_id:'Inventata',data:[{key:'scheme',value:'OG1'},{key:'issuer',value:'Ente inventato'}]},text,citation);assert.deepEqual(p.data,{scheme:'SOA',category:'OG1',classification:'III'});assert.equal(p.entity_tax_id,'');assert.equal(checkedProposal({kind:'experience',data:[],entity_name:'',entity_tax_id:''},text,citation),null);
});
test('Patrimonio: solo dati revisionati non scaduti entrano nel contesto, soggetto mantenuto',()=>{
 assert.equal(usableAsset({...asset,expires_on:'2025-12-31'},'2026-11-11'),false);assert.equal(usableAsset({...asset,reviewed_by:null}),false);
 const result=selectKnowledge([asset,{...asset,id:'b',status:'in_verifica'}],'Qualificazione OG1');assert.equal(result.selected.length,1);assert.equal(result.selected[0].entity_tax_id,'ALTRA');assert.equal(result.selected[0].revision,2);
});
test('Corrispondenze indicano categoria e titolare senza dichiarare ammissibilità',()=>{
 const [m]=matchAssets([{id:'r',description:'Qualificazione OG1 classifica III',threshold:'',expected_proof:'Attestazione SOA'}],[asset]);assert.equal(m.candidates[0].id,'a');assert.ok(m.candidates[0].reasons.some(r=>r.includes('Titolare: Impresa altra')));assert.ok(m.candidates[0].reasons.some(r=>r.includes('richiedono verifica')));
});
test('Campi comuni: etichette certe condivise, campi generici separati per modello',()=>{
 assert.equal(canonicalField({key:'cc_0',label:'Ragione sociale'}),'ragione_sociale');assert.equal(commonFieldKey({key:'cc_0',label:'Ragione sociale'},'x'),commonFieldKey({key:'cell_3',label:'Denominazione aziendale'},'y'));
 assert.notEqual(commonFieldKey({key:'cc_0',label:'Importo'},'x'),commonFieldKey({key:'cc_0',label:'Importo'},'y'));assert.equal(canonicalField({key:'cc_1',label:'Nome'}),null);assert.equal(canonicalField({key:'cc_2',label:'Ragione sociale ausiliaria'}),null);
});
