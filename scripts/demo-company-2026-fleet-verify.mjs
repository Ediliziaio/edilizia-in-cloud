/** Database proof: operational deadlines, accounting links, immutable history and tenant isolation. */
import {C,AS_OF,q,sql,guard,read,save,has} from './demo-company-2026.mjs';
import assert from 'node:assert/strict';
guard();
const mode=process.argv[2]??'verify';
const fingerprint=()=>sql(`select jsonb_build_object(
  'documents',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from mezzi_documenti d where company_id<>${q(C)}),
  'maintenance',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from mezzi_manutenzioni d where company_id<>${q(C)}),
  'assets',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from mezzi d where company_id<>${q(C)}),
  'other_costs',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from company_costs d where company_id<>${q(C)}),
  'other_cash',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from prima_nota_entries d where company_id<>${q(C)}),
  'other_received',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from fatture_ricevute d where company_id<>${q(C)}),
  'fiscal',(select md5(coalesce(string_agg(to_jsonb(d)::text,'|' order by id),'')) from documenti_fiscali d where company_id=${q(C)})
) data`)[0].data;
if(mode==='checkpoint') {
  if(has('fleet-boundary-before'))throw Error('Original verification checkpoint already exists');
  save('fleet-boundary-before',fingerprint(),true);console.log('Immutable tenant/fiscal boundary captured.');
} else {
  const before=read('before'),manifest=read('fleet-manifest');
  const deadlines=sql(`select * from mezzi_scadenze where company_id=${q(C)}`);
  const expired=deadlines.filter(r=>r.stato==='scaduto');assert.equal(expired.length,0,JSON.stringify(expired));
  // Compare the same JSONB representation as the backup, not CLI text coercions
  // (numeric strings and timestamp formatting otherwise produce false changes).
  const pastDocuments=sql(`select to_jsonb(d) data from mezzi_documenti d where company_id=${q(C)} and id in (${before.mezzi_documenti.map(r=>q(r.id)).join(',')})`).map(r=>r.data);
  const pastMaintenance=sql(`select to_jsonb(d) data from mezzi_manutenzioni d where company_id=${q(C)} and id in (${before.mezzi_manutenzioni.map(r=>q(r.id)).join(',')})`).map(r=>r.data);
  for(const [old,now] of [[before.mezzi_documenti,pastDocuments],[before.mezzi_manutenzioni,pastMaintenance]]) {
    assert.equal(old.length,now.length);const mapped=new Map(now.map(r=>[r.id,r]));for(const row of old)assert.deepEqual(mapped.get(row.id),row);
  }
  const [checks]=sql(`select
    (select count(*) from mezzi_documenti where company_id=${q(C)} and id in (${manifest.documentIds.map(q).join(',')})) documents,
    (select count(*) from mezzi_manutenzioni where company_id=${q(C)} and id in (${manifest.serviceIds.map(q).join(',')}) and data between '2026-01-01' and ${q(AS_OF)}) services,
    (select count(*) from tasks where company_id=${q(C)} and id in (${manifest.taskIds.map(q).join(',')}) and status='da_fare') planned_tasks,
    (select count(*) from company_costs c where c.company_id=${q(C)} and c.notes like '[DEMO 5.5M 2026 v1] Intervento fittizio%' and
      (select count(*) from prima_nota_entries p where p.company_id=c.company_id and p.cost_id=c.id and p.amount=round(c.amount*(1+c.vat_rate/100),2))=1 and
      (select count(*) from fatture_ricevute f where f.company_id=c.company_id and f.company_cost_id=c.id and f.imponibile_totale=c.amount)=1) linked_costs`);
  assert.equal(Number(checks.documents),manifest.documentIds.length);assert.equal(Number(checks.services),manifest.services);
  assert.equal(Number(checks.planned_tasks),manifest.planned);assert.equal(Number(checks.linked_costs),manifest.services);
  assert.deepEqual(fingerprint(),read('fleet-boundary-before'),'Other tenants or issued fiscal history changed');
  const result={company:C,asOf:AS_OF,expired:0,renewedDocuments:manifest.renewals,addedMissingDocuments:manifest.missingDocuments,
    services:manifest.services,maintenanceNet:manifest.maintenanceNet,plannedVerifications:manifest.planned,historyPreserved:true,otherTenantsUnchanged:true,fiscalHistoryUnchanged:true};
  save('fleet-verified',result);console.log(JSON.stringify(result,null,2));
}
