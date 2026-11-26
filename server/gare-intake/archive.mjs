import {execFile,python} from '../gare-ai/runtime.mjs';
import {fileURLToPath} from 'node:url';
export function archiveInventory(source,{selected,output,signal}={}){
 return new Promise((resolve,reject)=>{
  const child=execFile(python,[fileURLToPath(new URL('./archive.py',import.meta.url))],{signal,timeout:60000,maxBuffer:1500000},(error,stdout,stderr)=>{
   if(error)return reject(Error(stderr.trim().slice(-400)||'Archivio ZIP non leggibile'));
   try{resolve(JSON.parse(stdout));}catch{reject(Error('Inventario ZIP non valido'));}
  });child.stdin.end(JSON.stringify({source,selected,output}));
 });
}
