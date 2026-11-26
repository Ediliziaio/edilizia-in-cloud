import {execFile} from '../gare-ai/runtime.mjs';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
let visionBinary;
async function compileVision() {
 const folder = await mkdtemp(path.join(tmpdir(), 'gare-vision-'));
 const output = path.join(folder, 'vision');
 const source = fileURLToPath(new URL('./ocr.swift', import.meta.url));
 const cache = path.join(folder, 'modules');
 try {
  await exec('/usr/bin/swiftc', ['-O', source, '-module-cache-path', cache, '-o', output], { timeout: 120_000, maxBuffer: 500_000 });
 } finally {
  await rm(cache, { recursive: true, force: true });
 }
 return output;
}

export async function nativeOCR(file, page, { signal } = {}) {
 if (process.platform === 'darwin') {
  visionBinary ??= compileVision().catch(error => { visionBinary = undefined; throw error; });
  const { stdout } = await exec(await visionBinary, [file, String(page)], { signal, timeout: 90_000, maxBuffer: 2_000_000 });
  const result = JSON.parse(stdout);
  if (typeof result.text !== 'string') throw Error('Risposta Apple Vision non valida.');
  return result;
 }
 const { stdout } = await exec('tesseract', [file, 'stdout', '-l', 'ita+eng'], {
  signal, timeout: 90_000, maxBuffer: 2_000_000,
 });
 return { text: stdout, page };
}
export function payloadExtension(bytes){
 if(bytes.subarray(0,5).toString()==='%PDF-')return '.pdf';
 if(bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))return '.doc';
 if(bytes.subarray(0,2).toString()==='PK')return '.docx';
 if(bytes.subarray(0,200).toString().replace(/^\uFEFF/,'').trimStart().startsWith('<'))return '.xml';
 throw Error('Contenuto P7M non riconosciuto: conservato per controllo manuale');
}
export async function unwrapP7m(buffer,dir,{signal}={}){
 const source=path.join(dir,`${randomUUID()}.p7m`),out=path.join(dir,`${randomUUID()}.payload`);await writeFile(source,buffer);
 let last;
 for(const format of ['DER','PEM','SMIME']){
  try{
   // Extract CMS content only. No assertion about certificate trust, revocation,
   // legal validity or signing time is made by this operation.
   await exec('openssl',['cms','-verify','-noverify','-nosigs','-inform',format,'-in',source,'-out',out],{signal,timeout:15000,maxBuffer:100000});
   const bytes=await readFile(out);if(!bytes.length||bytes.length>50*1024*1024)throw Error('Dimensione del contenuto P7M non ammessa');
   return{buffer:bytes,ext:payloadExtension(bytes),warning:'Contenuto estratto dal P7M per lettura. Firma, certificato e revoca non verificati.'};
  }catch(e){last=e;if(signal?.aborted)throw e;}
 }
 throw Error(`Estrazione P7M non riuscita: ${String(last?.message).slice(0,120)}`);
}
export async function convertLegacyDoc(buffer,dir,{signal}={}){
 if(!buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw Error('Il file non è un Word DOC binario riconosciuto');
 const folder=path.join(dir,randomUUID()),profile=path.join(folder,'profile');await mkdir(path.join(profile,'user'),{recursive:true});
 await writeFile(path.join(profile,'user/registrymodifications.xcu'),'<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item></oor:items>');
 const source=path.join(folder,'original.doc');await writeFile(source,buffer);
 await exec('soffice',[`-env:UserInstallation=file://${profile}`,'--headless','--norestore','--nodefault','--convert-to','docx:Office Open XML Text','--outdir',folder,source],{signal,timeout:60000,maxBuffer:200000});
 const converted=await readFile(path.join(folder,'original.docx'));
 return{buffer:converted,ext:'.docx',warning:'Copia DOCX convertita localmente dal DOC. Controllare impaginazione, caselle e clausole con l’originale prima di utilizzare la bozza.'};
}
export async function normalizeSource(buffer,name,dir,options={}){
 let ext=path.extname(name).toLowerCase();const warnings=[];let converted=false;
 for(let depth=0;ext==='.p7m';depth++){
  if(depth>=3)throw Error('Troppi contenitori P7M annidati: controllo manuale richiesto');
  const payload=await unwrapP7m(buffer,dir,options);buffer=payload.buffer;ext=payload.ext;warnings.push(payload.warning);
 }
 if(ext==='.doc'){const result=await convertLegacyDoc(buffer,dir,options);buffer=result.buffer;ext=result.ext;warnings.push(result.warning);converted=true;}
 return{buffer,ext,warnings,converted};
}
