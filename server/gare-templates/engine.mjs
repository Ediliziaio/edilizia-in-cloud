import{execFile,python}from'../gare-ai/runtime.mjs';import{promisify}from'node:util';import{readFile,writeFile}from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{runtimeDir}from'../gare-ai/runtime.mjs';import{checkDocxArchive,inspectDocx,fillDocx,safePreviewCopy}from'./docx_fields.mjs';
import {normalizeSource} from '../gare-intake/formats.mjs';
const exec=promisify(execFile);
export async function formHelper(input,structured=false){const helper=fileURLToPath(new URL(structured?'./structured_forms.py':'./pdf_forms.py',import.meta.url));return new Promise((resolve,reject)=>{const p=execFile(python,[helper],{timeout:45000,maxBuffer:15_000_000},(error,out,err)=>{if(error)return reject(Error((err.split('\n').filter(Boolean).at(-1)||error.message).slice(0,700)));try{resolve(JSON.parse(out));}catch{reject(Error('Risposta del compilatore locale non valida'));}});p.stdin.end(JSON.stringify(input));});}
export async function inspectFile(buffer,name,dir){
 if(/\.(doc|p7m)$/i.test(name)){
  const normalized=await normalizeSource(buffer,name,dir);
  const meta=await inspectFile(normalized.buffer,'normalized'+normalized.ext,dir);
  return{...meta,converted:normalized.converted,source_format:path.extname(name).toLowerCase(),warning:[meta.warning,...normalized.warnings].filter(Boolean).join(' ')};
 }
 const ext=path.extname(name).toLowerCase(),source=path.join(dir,'inspect'+ext);await writeFile(source,buffer);
 if(ext==='.docx'){
  checkDocxArchive(buffer);let tokens=null;try{tokens=await inspectDocx(buffer);}catch(e){if(!/Nessun campo|protett|caselle/i.test(e.message))throw e;}
  const structured=await formHelper({operation:'inspect-docx',source},true);
  if(!structured.fields.length&&tokens)return tokens;
  if(!structured.fields.length)throw Error('Non riconosciuti campi o celle vuote: usa il percorso manuale senza modificare le clausole');
  if(tokens&&structured.fields.every(f=>f.target?.type==='token'))return tokens;
  return structured;
 }
 if(ext==='.pdf'){try{return await formHelper({operation:'inspect',source});}catch(e){if(!/senza campi AcroForm/.test(e.message))throw e;return formHelper({operation:'inspect-pdf',source},true);}}
 throw Error('Modello assistito disponibile per DOCX e PDF. Conservare gli altri originali e compilare manualmente.');
}
export async function fillFile(buffer,contract,values,dir){
 if(contract.constraints?.source_format)buffer=(await normalizeSource(buffer,'original'+contract.constraints.source_format,dir)).buffer;
 let output,preview=null;const word=contract.format.startsWith('docx');
 if(word){
  if(contract.format==='docx_tokens')output=(await fillDocx(buffer,values)).buffer;
  else{
   const source=path.join(dir,'structured.docx'),out=path.join(dir,'filled.docx');await writeFile(source,buffer);await formHelper({operation:'fill-docx',source,output:out,values},true);output=await readFile(out);
  }
  try{const source=path.join(dir,'preview.docx');await writeFile(source,await safePreviewCopy(output));await exec('soffice',[`-env:UserInstallation=file://${path.join(dir,'office-profile')}`,'--headless','--convert-to','pdf','--outdir',dir,source],{timeout:45000,maxBuffer:200000});preview=await readFile(path.join(dir,'preview.pdf'));}catch{}
 }else{
  const source=path.join(dir,'source.pdf'),out=path.join(dir,'filled.pdf');await writeFile(source,buffer);
  await formHelper({operation:contract.format==='pdf_mapped'?'fill-pdf':'fill',source,output:out,values,fields:contract.fields},contract.format==='pdf_mapped');output=await readFile(out);preview=output;
 }
 return{output,preview};
}
