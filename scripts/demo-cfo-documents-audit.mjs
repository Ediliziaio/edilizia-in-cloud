// Read-only export of the three DEMO jobs. Never sends a signing request.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = JSON.parse(readFileSync('work/demo-cfo/manifest.json', 'utf8'));
const keys = ['int','mix','sub'];
const ids = keys.map(k => m.records.find(r => r.key === 'order-'+k).id);
const sql = `select jsonb_build_object('report',to_jsonb(r),'ordine',to_jsonb(o),
 'company',jsonb_build_object('name',c.name),
 'employees',(select jsonb_agg(jsonb_build_object('id',e.id,'nome',concat_ws(' ',e.first_name,e.last_name))) from employees e where e.company_id=o.company_id),
 'phases',(select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) from order_work_phases p where p.order_id=o.id)) as context
 from orders o join companies c on c.id=o.company_id
 join lateral (select * from campo_rapportini where order_id=o.id order by data_lavoro limit 1) r on true
 where o.company_id='${m.company}' and o.id in (${ids.map(id=>"'"+id+"'").join(',')});`;
const contexts = JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'})).rows.map(r=>r.context);
if (contexts.length !== 3) throw new Error('Expected exactly three DEMO reports');
mkdirSync('tmp/pdfs',{recursive:true});
await build({entryPoints:['supabase/functions/genera-pdf-rapportino/render.ts'],outfile:'tmp/pdfs/render.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'deno-pdf',setup(b){b.onResolve({filter:/^https:\/\/esm.sh\/pdf-lib/},()=>({path:require.resolve('pdf-lib')}));}}]});
const { renderRapportino } = await import(pathToFileURL(resolve('tmp/pdfs/render.mjs')));
const audit = [];
for (const ctx of contexts) {
 const key = keys[ids.indexOf(ctx.ordine.id)];
 const report = {...ctx.report, ordine:ctx.ordine};
 const result = await renderRapportino({report,company:ctx.company,branding:{primaryColor:'#193E68'},phases:ctx.phases??[],punches:[],warnings:[],revision:'DEMO-QA',generatedAt:'2026-09-30T14:00:00Z'}, async(ref,kind)=>{
   if(kind!=='photo') return null;
   const match=/demo-cfo-(prima|lavori|finale)\.jpg/.exec(ref);
   return match ? new Uint8Array(readFileSync(`work/demo-cfo/${key}-${match[1]}.jpg`)) : null;
 });
 const path=`tmp/pdfs/rapportino-${key}.pdf`;
 writeFileSync(path,result.bytes);
 const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
 for (const required of ['COMMESSA','Lavori eseguiti','Ore fase','Verifica','Foto 1 di 1']) {
   if(!text.includes(required)) throw new Error(key+' missing '+required);
 }
 audit.push({scenario:key,pages:result.pageCount,warnings:result.warnings,crewNamesMissing:text.includes('Nome non registrato'),materialsPresent:!!report.materiali_usati?.length,clientSigned:!!report.firma_cliente_url,path});
}
writeFileSync('work/demo-cfo/documents-audit.json',JSON.stringify(audit,null,2));
console.log(audit);
