/** Packaging labels from the existing stock catalogue, without changing quantities. */
import {C,q,j,sql,guard,context,read,save,has,digest,cleanQueue,invariantSQL} from './demo-company-procurement.mjs';
export function unitFor(name){
 if(/sacco|Cemento|Malta|Rasante|Collante/i.test(name))return 'sacchi';
 if(/scatola/i.test(name))return 'scatole';
 if(/Cavo elettrico|bobina/i.test(name))return 'bobine';
 if(/Tubo multistrato|rotolo|Nastro/i.test(name))return 'rotoli';
 if(/Profilo metallico|Battiscopa|barra/i.test(name))return 'barre';
 if(/Idropittura|secchio/i.test(name))return 'secchi';
 if(/Lastra/i.test(name))return 'lastre';
 if(/Stucco fughe|confezione/i.test(name))return 'confezioni';
 if(/Kit/i.test(name))return 'kit';
 return 'pz';
}
export function buildUnits(p){
 const plan=structuredClone(p),statements=[];
 for(const f of plan.manifest.receipts){let changed=false;for(const r of f.righe){if(!r.stock_item_id)continue;const unit=unitFor(r.descrizione);changed||=r.unita_misura!==unit;r.unita_misura=unit;}if(changed)statements.push(`update fatture_ricevute set righe=${j(f.righe)} where company_id=${q(C)} and id=${q(f.id)} and xml_raw is null and imponibile_totale=${q(f.imponibile_totale)};`);}
 for(const dt of plan.manifest.ddts){for(const r of dt.physical)r.unita_misura=unitFor(r.descrizione);for(const x of dt.small)for(const r of x.lines)r.unita_misura=unitFor(r.descrizione);}
 for(const r of plan.manifest.physical)r.unita_misura=unitFor(r.descrizione);
 return {company:C,plan,batches:Array.from({length:Math.ceil(statements.length/12)},(_,i)=>statements.slice(i*12,i*12+12))};
}
if(process.argv[1]?.endsWith('demo-company-procurement-units.mjs')){
 const mode=process.argv[2]||'plan';guard();
 if(mode==='plan'){if(has('units-apply'))throw Error('Preserve applied unit plan');const p=buildUnits(read('plan'));save('units-plan',p);console.log(JSON.stringify({receipts:p.batches.flat().length,batches:p.batches.length}));}
 else if(['dry','apply'].includes(mode)){
  const p=read('units-plan'),hash=digest(p),log=has('units-'+mode)?read('units-'+mode):{hash,completed:[]};if(log.hash!==hash)throw Error('Unit plan changed');if(mode==='apply'&&(!has('units-dry')||read('units-dry').hash!==hash||read('units-dry').completed.length!==p.batches.length))throw Error('Rollback rehearsal required');
  for(const [i,b]of p.batches.entries()){if(log.completed.includes(i))continue;sql(`begin;${context}${b.join('\n')}${invariantSQL(read('before'),read('physical-before'))}${cleanQueue()}${mode==='dry'?'rollback':'commit'};`);log.completed.push(i);save('units-'+mode,log);}console.log(`${mode}: ${log.completed.length}/${p.batches.length}`);
 }else throw Error('Unknown mode');
}
