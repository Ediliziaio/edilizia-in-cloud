import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { checkDocxArchive,inspectDocx,fillDocx,safePreviewCopy } from './docx_fields.mjs';
import { canonicalJson,normalizeNotice } from '../gare-sources/ted.mjs';
import { python } from '../gare-ai/runtime.mjs';
const helper=new URL('./pdf_forms.py',import.meta.url).pathname;
const xml='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>CLAUSOLA DA PRESERVARE. Impresa: {{ragione_</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>sociale}}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>PEC {{pec}} · valore {{pec}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
async function fixture(extra={}){const zip=new JSZip();zip.file('word/document.xml',xml);for(const[k,v]of Object.entries(extra))zip.file(k,v);return zip.generateAsync({type:'nodebuffer'});}
test('DOCX individua campi spezzati fra run e nelle tabelle, senza duplicati',async()=>assert.deepEqual((await inspectDocx(await fixture())).fields.map(f=>f.key),['ragione_sociale','pec']));
test('DOCX compila campi ripetuti preservando clausole, tabella e formattazione',async()=>{const result=await fillDocx(await fixture(),{ragione_sociale:'Impresa & figli',pec:'test@example.test'});const zip=await JSZip.loadAsync(result.buffer);const text=await zip.file('word/document.xml').async('string');assert.ok(text.includes('CLAUSOLA DA PRESERVARE'));assert.ok(text.includes('<w:tbl>'));assert.ok(text.includes('<w:b/>'));assert.ok(text.includes('Impresa &amp; figli'));assert.equal((text.match(/test@example.test/g)||[]).length,2);assert.ok(!text.includes('{{'));});
test('DOCX lascia visibili i dati mancanti e rifiuta campi o righe non previsti',async()=>{const buffer=await fixture();assert.deepEqual((await fillDocx(buffer,{pec:'x'})).missing,['ragione_sociale']);await assert.rejects(fillDocx(buffer,{inventato:'x'}));await assert.rejects(fillDocx(buffer,{pec:'a\nb'}));});
test('DOCX rifiuta firma, contenuti attivi e zip anomali',async()=>{await assert.rejects(inspectDocx(await fixture({'_xmlsignatures/sig.xml':'signed'})));assert.throws(()=>checkDocxArchive(Buffer.from('non ZIP')));const zip=new JSZip();zip.file('word/document.xml',xml);zip.file('huge',Buffer.alloc(51_000_000));const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});assert.throws(()=>checkDocxArchive(buffer),/espanso/);});
test('anteprima DOCX elimina relazioni esterne e rifiuta campi DDE',async()=>{const zip=await JSZip.loadAsync(await safePreviewCopy(await fixture({'word/_rels/document.xml.rels':'<Relationships><Relationship Id="x" TargetMode="External" Target="https://example.test"/></Relationships>'})));assert.ok(!(await zip.file('word/_rels/document.xml.rels').async('string')).includes('example.test'));await assert.rejects(safePreviewCopy(await fixture({'word/settings.xml':'<w:instrText>DDEAUTO dangerous</w:instrText>'})),/attivo/);});
test('PDF campi canonici, widget e anteprime coerenti; overflow bloccato',()=>{const dir=mkdtempSync(path.join(tmpdir(),'gare-pdf-'));try{
 const source=path.join(dir,'source.pdf'),output=path.join(dir,'compiled.pdf');
 execFileSync(python,['-c',`from reportlab.pdfgen import canvas\nimport sys\nc=canvas.Canvas(sys.argv[1]);c.drawString(50,780,'MODELLO DIMOSTRATIVO - CLAUSOLA DA PRESERVARE');c.acroForm.textfield(name='ragione_sociale',x=50,y=720,width=320,height=22,fontName='Helvetica',fontSize=10,maxlen=60);c.drawString(50,690,'Il documento non costituisce dichiarazione reale.');c.save()`,source]);
 const form=request=>JSON.parse(execFileSync(python,[helper],{input:JSON.stringify(request),encoding:'utf8',stdio:['pipe','pipe','pipe']}));const before=form({operation:'inspect',source});assert.equal(before.fields[0].key,'ragione_sociale');assert.equal(before.fields[0].supported,true);
 const filled=form({operation:'fill',source,output,values:{ragione_sociale:'Impresa DEMO Srl'}});assert.equal(filled.verified_fields.length,1);assert.equal(form({operation:'inspect',source:output}).fields[0].value,'Impresa DEMO Srl');
 assert.throws(()=>form({operation:'fill',source,output,values:{ragione_sociale:'W'.repeat(60)}}));assert.throws(()=>form({operation:'fill',source,output,values:{inesistente:'x'}}));
 writeFileSync(source,Buffer.concat([readFileSync(source),Buffer.from('\n% /ByteRange signed')]));assert.throws(()=>form({operation:'inspect',source}));
 }finally{rmSync(dir,{recursive:true,force:true});}});
test('hash delle fonti non dipende dall’ordine delle proprietà JSON',()=>assert.equal(canonicalJson({b:[{y:2,x:1}],a:0}),canonicalJson({a:0,b:[{x:1,y:2}]})));
test('TED mantiene stima, date e orari separati senza inventare base o scadenza',()=>{const n=normalizeNotice({'publication-number':'12345-2026','notice-title':{eng:['Title'],ita:['Titolo']},'estimated-value-proc':['125000'],'deadline-receipt-tender-date-lot':['2026-12-01+01:00','2026-12-02+01:00']});assert.equal(n.title,'Titolo');assert.equal(n.base_amount,undefined);assert.deepEqual(n.deadline_times,[]);assert.equal(n.deadline_dates.length,2);assert.throws(()=>normalizeNotice({'publication-number':'https://evil.test'}));});

test('la protezione del DOCX nelle impostazioni impedisce la compilazione',async()=>{await assert.rejects(inspectDocx(await fixture({'word/settings.xml':'<w:settings><w:documentProtection w:enforcement="1"/></w:settings>'})),/protetto/);});

test('anteprima: collegamenti fra stili consentiti, LINK nei campi attivi rifiutato',async()=>{await safePreviewCopy(await fixture({'word/styles.xml':'<w:styles><w:style><w:link w:val="Heading1Char"/></w:style></w:styles>'}));await assert.rejects(safePreviewCopy(await fixture({'word/settings.xml':'<w:fldSimple w:instr="LINK external"/>'})),/attivo/);});
