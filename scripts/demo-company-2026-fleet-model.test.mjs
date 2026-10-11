import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetRenewals } from './demo-company-2026-fleet-model.mjs';
const asset={id:'van',company_id:'demo',tipo:'furgone',stato:'in_servizio',possesso:'proprieta',nome:'Demo van',contatore:80000,contatore_unita:'km'};
const old={id:'insurance',mezzo_id:'van',categoria:'assicurazione',data_scadenza:'2025-12-31',importo:600};
const input=()=>({mezzi:[asset],mezzi_documenti:[old],mezzi_manutenzioni:[],deadlines:[{origine:'documento',mezzo_id:'van',riferimento_id:old.id,stato:'scaduto',data_scadenza:old.data_scadenza}]});
const config={asOf:'2026-10-10',marker:'DEMO',uid:k=>'new-'+k};
test('renewals preserve historical rows and never reuse IDs or legal files',()=>{
  const data=input(),before=structuredClone(data),p=fleetRenewals(data,config);
  assert.deepEqual(data,before);assert.equal(p.documents[0].row.data_scadenza,'2026-12-31');
  assert.equal(p.documents[0].row.data_inizio,'2026-01-01');assert.notEqual(p.documents[0].row.id,old.id);assert.equal(p.documents[0].row.file_path,null);
});
test('upcoming events stay planned, not executed in the future',()=>{
  const data=input();data.deadlines[0]={...data.deadlines[0],stato:'in_scadenza',data_scadenza:'2026-10-12'};
  const p=fleetRenewals(data,config);assert.equal(p.documents.length,0);assert.equal(p.scheduled.length,1);assert.equal(p.scheduled[0].date,'2026-10-12');
});
test('service uses elapsed 2026, with future date and mileage thresholds',()=>{
  const data=input();data.mezzi_manutenzioni=[{id:'service',tipo:'tagliando',costo:480}];
  data.deadlines=[{origine:'manutenzione',mezzo_id:'van',riferimento_id:'service',stato:'scaduto',data_scadenza:'2026-05-20'}];
  const p=fleetRenewals(data,config);assert.equal(p.maintenance[0].row.data,'2026-05-20');assert.equal(p.maintenance[0].row.prossima_data,'2027-05-20');assert.equal(p.maintenance[0].row.prossimo_contatore,95000);
});
test('unsupported history and future execution fail closed',()=>{
  const data=input();data.mezzi_documenti[0]={...old,categoria:'altro'};assert.throws(()=>fleetRenewals(data,config),/human review/);
  assert.throws(()=>fleetRenewals(input(),{...config,asOf:'2025-10-10'}),/2026/);
});
test('existing valid categories are not duplicated; unrelated tools have no imaginary road documents',()=>{
  const data=input();data.mezzi.push({...asset,id:'tool',tipo:'attrezzatura'});data.mezzi_documenti.push({id:'r',mezzo_id:'van',categoria:'revisione'});
  const p=fleetRenewals(data,config);assert.deepEqual(p.missing.map(d=>d.categoria),['bollo']);assert.ok(p.missing.every(d=>d.mezzo_id==='van'));
});
