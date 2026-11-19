/** Verifica tutte le copie installate di picomatch. Non nasconde gli advisory del registro. */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(process.argv[2]||process.cwd());
const seen=new Set(), matches=[];
function packages(modules){
 let dirs;try{dirs=readdirSync(modules,{withFileTypes:true});}catch{return;}
 for(const entry of dirs){
  if(entry.name.startsWith('.'))continue;
  const dir=join(modules,entry.name);
  if(entry.name.startsWith('@')){packages(dir);continue;}
  let real;try{real=realpathSync(dir);}catch{continue;}
  if(seen.has(real))continue;seen.add(real);
  try{const pkg=JSON.parse(readFileSync(join(real,'package.json'),'utf8'));if(pkg.name==='picomatch')matches.push({dir:real,version:pkg.version});}catch{continue;}
  packages(join(real,'node_modules'));
 }
}
packages(join(root,'node_modules'));
if(!matches.length)throw new Error('Dipendenze non verificate: picomatch non trovato. Esegui l’installazione frozen.');
for(const entry of matches){
 const source=readFileSync(join(entry.dir,'lib/parse.js'),'utf8');
 if(!['2.3.2','4.0.4'].includes(entry.version)||!source.includes('EIC security hardening'))throw new Error(`Mitigazione picomatch assente o versione da riesaminare: ${relative(root,entry.dir)} @${entry.version}`);
 const code=`const assert=require('node:assert/strict');const pm=require(${JSON.stringify(entry.dir)});for(const glob of ['+(*)','+(*a)','*(*)!','+(*a)!','+(?)']){for(const opts of [{},{maxExtglobRecursion:false},{dot:true}])pm(glob,opts)('a'.repeat(500)+'!');}assert(pm('src/**/*.{ts,tsx}')('src/components/warehouse/CaricoRapidoSheet.tsx'));assert(pm('+(foo|bar).js')('foobar.js'));assert(!pm('**/*.png')('x.svg'));`;
 const r=spawnSync(process.execPath,['-e',code],{timeout:2500,encoding:'utf8'});
 if(r.error||r.status!==0)throw new Error(`Mitigazione/compatibilità picomatch non verificata: ${relative(root,entry.dir)} @${entry.version}`);
}
process.stdout.write(`Mitigazione picomatch verificata su tutte le ${matches.length} copie installate. L’audit degli advisory resta separato.\n`);
