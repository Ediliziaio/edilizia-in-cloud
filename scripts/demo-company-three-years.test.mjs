import test from 'node:test';
import assert from 'node:assert/strict';
import {financialYears,salBackfillProof} from './demo-company-three-years-verify.mjs';
import {read,has} from './demo-company-accounting-audit.mjs';
import {read as closure,has as closureHas} from './demo-company-closure.mjs';
// These saved-data checks are intentionally not backed by public database fixtures.
const savedTest=(name,required,fn)=>test(name,{skip:required.every(closureHas)&&has('latest')?false:'Private finance/SAL snapshots not present'},fn);
const f=(year,amount,stato='emessa',tipo='fattura',date=year+'-06-10')=>({tipo,stato,data_emissione:date,imponibile_totale:amount,importo_pagato:0,deleted_at:null});
test('past draft invoices are not added to the 2026 annual forecast',()=>{
 const result=financialYears({documenti_fiscali:[f('2026',100),f('2026',200,'bozza'),f('2026',300,'bozza','fattura','2026-12-01')]});
 assert.equal(result[2026].issuedNet,100);assert.equal(result[2026].forecastNet,300);assert.equal(result[2026].scenarioNet,400);
});
test('cancelled and deleted invoices cannot inflate turnover; credit notes subtract',()=>{
 const deleted={...f('2025',500),deleted_at:'2026-01-01'};
 const result=financialYears({documenti_fiscali:[f('2025',1000),f('2025',200,'emessa','nota_credito'),f('2025',500,'annullata'),deleted]});
 assert.equal(result[2025].issuedNet,800);assert.equal(result[2025].forecastNet,0);
});
savedTest('saved native scenario preserves the requested net annual totals',[],()=>{
 const y=financialYears(read('latest'));for(const year of [2024,2025,2026])assert.equal(y[year].scenarioNet,y[year].targetNet);
 assert.equal(y[2026].issuedNet,4635702.56);assert.equal(y[2026].forecastNet,864297.44);assert.equal(y[2026].forecastCount,27);
});
savedTest('historical missing SALs are cumulative, linked to existing invoice installments',['sal-gap-2025-plan'],()=>{
 const p=closure('sal-gap-2025-plan');assert.equal(p.batches.length,12);assert.equal(p.manifest.documents.length,36);
 for(const order of new Set(p.manifest.documents.map(s=>s.order_id))){const xs=p.manifest.documents.filter(s=>s.order_id===order).sort((a,b)=>a.numero_sal-b.numero_sal);assert.deepEqual(xs.map(x=>x.percentage),[30,70,100]);assert.equal(Math.round(xs.reduce((n,x)=>n+x.incrementNet,0)*100),Math.round(xs[2].net*100));assert.equal(xs[2].importo_totale,xs[2].net);assert.ok(xs.every(x=>x.installment_id&&x.invoice&&x.data_emissione.startsWith('2025-')));}
});
savedTest('SAL backfill cannot issue another invoice, register money or create a cost',['sal-gap-2025-plan'],()=>{
 const p=closure('sal-gap-2025-plan'),s=p.batches.flat().join('\n');
 assert.equal(p.manifest.newInvoices,0);assert.equal(p.manifest.newCash,0);assert.equal(p.manifest.newCosts,0);
 assert.ok(!/insert into[^\n]*(documenti_fiscali|invoices|company_costs|bank_transactions|prima_nota_entries)/i.test(s));
 assert.ok(s.includes('SAL backfill changed prices, costs or cash'));assert.ok(s.includes('NON FIRMATO'));
});
const proofFixture=()=>{
 const current=read('latest'),before=closure('sal-gap-2025-before'),plan=closure('sal-gap-2025-plan'),pdfs=closure('sal-gap-2025-pdf-apply');
 const attachments=pdfs.completed.map(p=>({company_id:current.company,order_id:plan.manifest.documents.find(s=>s.id===p.id).order_id,file_url:p.path,file_size:p.bytes,visible_to_customer:false,file_type:'application/pdf'}));
 return {current,before,plan,pdfs,attachments};
};
const proofInputs=['sal-gap-2025-before','sal-gap-2025-plan','sal-gap-2025-pdf-apply'];
savedTest('saved SAL rows and protected financial records pass post-write verification',proofInputs,()=>{
 const x=proofFixture(),p=salBackfillProof(x.before,x.current,x.plan,x.pdfs,x.attachments);
 assert.deepEqual(p,{saved:true,privatePDFs:true,financialUnchanged:true,documents:36});
});
savedTest('a missing, public or other-tenant attachment cannot certify a private SAL PDF',proofInputs,()=>{
 for(const change of ['missing','public','tenant']){const x=proofFixture();if(change==='missing')x.attachments.pop();else if(change==='public')x.attachments[0].visible_to_customer=true;else x.attachments[0].company_id='another-company';assert.equal(salBackfillProof(x.before,x.current,x.plan,x.pdfs,x.attachments).privatePDFs,false);}
});
savedTest('a changed SAL amount or missing cumulative line fails the saved-data check',proofInputs,()=>{
 for(const change of ['amount','line']){const x=proofFixture(),id=x.plan.manifest.documents[0].id;if(change==='amount')x.current.sal_records.find(s=>s.id===id).importo_totale+=1;else x.current.sal_voci=x.current.sal_voci.filter(v=>v.sal_id!==id);assert.equal(salBackfillProof(x.before,x.current,x.plan,x.pdfs,x.attachments).saved,false);}
});
savedTest('a financial change cannot hide behind unchanged record counts',proofInputs,()=>{
 for(const [table,field]of [['company_costs','amount'],['fatture_ricevute','imponibile_totale'],['bank_transactions','account_id'],['prima_nota_entries','direction']]){
  const x=proofFixture(),row=x.current[table][0];row[field]=typeof row[field]==='number'?row[field]+1:'changed';
  assert.equal(salBackfillProof(x.before,x.current,x.plan,x.pdfs,x.attachments).financialUnchanged,false,table+'.'+field);
 }
});
