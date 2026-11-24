import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeSegments, planAnalysisSegments } from './analysis-segments.mjs';
import { contextText } from './inference.mjs';

const page = (page, text) => ({ document_id:'doc', version:3, page, section:'Clausole',text });
const answer = (id) => ({ summary:'', requirements:[{id}], required_documents:[], deadlines:[],
 technical_criteria:[], criteria:[], risks:[], missing_documents:[] });

test('l’analisi distribuisce oltre trenta segmenti e conserva pagina e testo nelle sovrapposizioni', async () => {
 const pages = Array.from({ length:36 },(_,i)=>page(i+1,'A'.repeat(480)));
 pages.push(page(37,('0123456789').repeat(186)+'CLAUSOLA_FINALE'));
 const segments = planAnalysisSegments(pages,700);
 assert.ok(segments.length>30);
 assert.ok(segments.every(items=>contextText(items).length<=700));
 assert.ok(segments.flat().some(p=>p.page===37 && p.text.includes('CLAUSOLA_FINALE')));
 const result=await analyzeSegments({segments, analyze:items=>answer(String(items[0].page))});
 assert.equal(result.requirements.length,37);
});

test('se il modello tronca la risposta, il segmento riparte in parti più brevi e mantiene i risultati', async () => {
 const segments = [[page(1,'A'.repeat(950)),page(2,'B'.repeat(950))]];
 const attempts=[], saves=[];
 const result=await analyzeSegments({segments, async analyze(items){
  attempts.push(items.length);
  if(items.length>1)throw Object.assign(Error('Risposta troncata'),{code:'MODEL_OUTPUT_LENGTH'});
  return answer(String(items[0].page));
 }, save:cp=>saves.push(structuredClone(cp))});
 assert.deepEqual(attempts,[2,1,1]);
 assert.deepEqual(result.requirements.map(r=>r.id),['1','2']);
 assert.equal(saves[0].completed,0);
 assert.equal(saves.at(-1).completed,2);
});

test('dopo interruzione riparte dall’ultimo segmento completo e ricomincia se il testo cambia', async () => {
 const segments=[[page(1,'Primo segmento')],[page(2,'Secondo segmento')]];
 let checkpoint;
 await assert.rejects(analyzeSegments({segments,analyze:items=>{
  if(items[0].page===2)throw Error('Servizio interrotto');
  return answer('1');
 },save:cp=>checkpoint=structuredClone(cp)}),/Servizio interrotto/);
 const attempts=[];
 const result=await analyzeSegments({segments,checkpoint,analyze:items=>{
  attempts.push(items[0].page);
  return answer('2');
 }});
 assert.deepEqual(attempts,[2]);
 assert.deepEqual(result.requirements.map(r=>r.id),['1','2']);
 await analyzeSegments({segments:[[page(1,'Testo riletto')],segments[1]],checkpoint,analyze:items=>{
  attempts.push(items[0].page);
  return answer(String(items[0].page));
 }});
 assert.deepEqual(attempts,[2,1,2]);
});


test('dopo la suddivisione riprende dalla prima parte rimasta senza rieseguire la parte salvata', async ()=>{
 const segments=[[page(1,'A'.repeat(950)),page(2,'B'.repeat(950))]];
 let checkpoint;
 await assert.rejects(analyzeSegments({segments,analyze:items=>{
  if(items.length>1)throw Object.assign(Error('Risposta troncata'),{code:'MODEL_OUTPUT_LENGTH'});
  if(items[0].page===2)throw Error('Servizio interrotto');
  return answer('1');
 },save:cp=>checkpoint=structuredClone(cp)}),/Servizio interrotto/);
 assert.equal(checkpoint.completed,1);
 assert.deepEqual(checkpoint.pending,[{index:0,path:[1]}]);
 const result=await analyzeSegments({segments,checkpoint,analyze:items=>{
  assert.deepEqual(items.map(p=>p.page),[2]);
  return answer('2');
 }});
 assert.deepEqual(result.requirements.map(r=>r.id),['1','2']);
});
