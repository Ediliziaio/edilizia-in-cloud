import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Riceve solo metadati, mai SQL, header o segreti dei cron. */
export function cronSenzaFunzione(jobs,functions) {
  const known=new Set(functions);
  return jobs.filter(j=>j.active && j.endpoint && !known.has(j.endpoint))
    .map(j=>({id:j.id,nome:j.nome,endpoint:j.endpoint}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const jobs=JSON.parse(readFileSync(0,'utf8'));
    if(!Array.isArray(jobs)) throw new Error('Metadati cron non validi');
    const directory=resolve('supabase/functions');
    const functions=readdirSync(directory,{withFileTypes:true}).filter(d=>d.isDirectory() && !d.name.startsWith('_') && existsSync(join(directory,d.name,'index.ts'))).map(d=>d.name);
    const missing=cronSenzaFunzione(jobs,functions);
    if(missing.length) {console.error(JSON.stringify({ok:false,motivo:'cron_senza_funzione',cron:missing}));process.exitCode=1;}
    else console.log(JSON.stringify({ok:true,cron_controllati:jobs.filter(j=>j.active && j.endpoint).length}));
  } catch(e) {console.error('Verifica destinazioni cron non completata:',e.message);process.exitCode=1;}
}
