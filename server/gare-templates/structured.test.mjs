import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{execFileSync}from'node:child_process';import JSZip from'jszip';import{inspectFile,fillFile,formHelper}from'./engine.mjs';import{python}from'../gare-ai/runtime.mjs';
async function sandbox(fn){const d=await mkdtemp(path.join(tmpdir(),'gare-structured-'));try{await fn(d);}finally{await rm(d,{recursive:true,force:true});}}
const start='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>',end='</w:body></w:document>';
const sdt=(label,props='',value='')=>`<w:sdt><w:sdtPr><w:alias w:val="${label}"/>${props}</w:sdtPr><w:sdtContent><w:r><w:rPr><w:b/></w:rPr><w:t>${value}</w:t></w:r></w:sdtContent></w:sdt>`;
async function word(xml){const zip=new JSZip();zip.file('word/document.xml',start+xml+end);return zip.generateAsync({type:'nodebuffer'});}
test('Word: controlli, celle e caselle mantengono clausole, formattazione e campi protetti',()=>sandbox(async d=>{
 const buffer=await word('<w:p><w:r><w:t>CLAUSOLA INVARIATA {{pec}}</w:t></w:r>'+sdt('Ragione sociale')+sdt('Non alterare','<w:lock w:val="sdtContentLocked"/>','fisso')+sdt('Selezione','<w14:checkbox><w14:checked w14:val="0"/></w14:checkbox>','☐')+'</w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>PEC</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>');
 const contract=await inspectFile(buffer,'modello.docx',d);assert.equal(contract.format,'docx_structured');assert.equal(contract.fields.filter(f=>f.supported).length,4);assert.equal(contract.fields.find(f=>f.label==='Non alterare').supported,false);
 const values=Object.fromEntries(contract.fields.filter(f=>f.supported).map(f=>[f.key,f.type==='checkbox'?'true':['PEC','pec'].includes(f.label)?'qa@example.test':'Impresa QA']));
 const {output}=await fillFile(buffer,contract,values,d);const zip=await JSZip.loadAsync(output),xml=await zip.file('word/document.xml').async('string');assert.ok(xml.includes('CLAUSOLA INVARIATA'));assert.ok(xml.includes('fisso'));assert.ok(xml.includes('Impresa QA'));assert.ok(xml.includes('qa@example.test'));assert.ok(xml.includes('w:b'));assert.match(xml,/checked[^>]+val="1"/);
 await assert.rejects(fillFile(buffer,contract,{cc_1:'Riscrittura'},d),/supportato|protetto/);
}));
test('PDF senza campi: mappa confermata, testo conservato, sovrapposizioni e overflow rifiutati',()=>sandbox(async d=>{
 const source=path.join(d,'flat.pdf');execFileSync(python,['-c',"from reportlab.pdfgen import canvas\nimport sys\nc=canvas.Canvas(sys.argv[1]);c.drawString(40,780,'CLAUSOLA INVARIATA');c.drawString(40,720,'Impresa:');c.save()",source]);
 const bytes=await readFile(source),contract=await inspectFile(bytes,'modello.pdf',d);assert.equal(contract.format,'pdf_mapped');const field={key:'impresa',label:'Ragione sociale',page:1,rect:[120,100,440,122],supported:true,type:'text',required:true,confirmed_blank:true};
 await formHelper({operation:'validate-regions',source,fields:[field]},true);
 const output=await fillFile(bytes,{...contract,fields:[field]},{impresa:'Impresa QA'},d);const out=path.join(d,'result.pdf');await writeFile(out,output.output);const text=execFileSync(python,['-c',"import fitz,sys\np=fitz.open(sys.argv[1]);print(''.join(x.get_text() for x in p))",out],{encoding:'utf8'});assert.match(text,/Impresa QA/);assert.match(text,/CLAUSOLA INVARIATA/);
 await assert.rejects(formHelper({operation:'validate-regions',source,fields:[{...field,confirmed_blank:false}]},true),/Confermare/);
 await assert.rejects(formHelper({operation:'validate-regions',source,fields:[field,{...field,key:'secondo'}]},true),/sovrappongono/);
 await assert.rejects(formHelper({operation:'validate-regions',source,fields:[{...field,rect:[35,48,400,70]}]},true),/testo originale/);
 await assert.rejects(fillFile(bytes,{...contract,fields:[{...field,rect:[120,100,145,111]}]},{impresa:'Questa ragione sociale è troppo lunga per una casella minuscola'},d),/entra|lunga/);
}));
test('PDF canonico: casella e scelta vengono compilate con valori ammessi senza risposte implicite',()=>sandbox(async d=>{
 const source=path.join(d,'choice.pdf');execFileSync(python,['-c',"from reportlab.pdfgen import canvas\nimport sys\nc=canvas.Canvas(sys.argv[1]);c.acroForm.checkbox(name='dichiarazione',x=40,y=700);c.acroForm.choice(name='forma',options=['Singola','RTI'],value='Singola',x=90,y=640,width=240,height=24);c.showPage();c.save()",source]);
 const bytes=await readFile(source),contract=await inspectFile(bytes,'scelte.pdf',d);assert.ok(contract.fields.every(f=>f.supported));assert.ok(contract.fields.find(f=>f.key==='dichiarazione').options.includes('Yes'));
 const {output}=await fillFile(bytes,contract,{dichiarazione:'Yes',forma:'RTI'},d);assert.ok(output.length>0);
 await assert.rejects(fillFile(bytes,contract,{dichiarazione:'Inventata'},d),/Scelta/);
}));
