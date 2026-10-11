/** Fill associations and missing DEMO supplier documents, without new expenses/payments. */
import {createHash} from 'node:crypto';
import {C,A,AS_OF,MARK,q,j,sql,guard,context,insert,read,save,has} from './demo-company-accounting-audit.mjs';
import {uid} from './demo-company-accounting-repair.mjs';
import {cents,grouped,sum} from './demo-company-accounting-verify.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function build(){
 const d=read('latest'),batches=[],manifest={company:C,costLinks:[],receiptLinks:[],received:[],suppliers:[],forecastCosts:[]};
 const bank=new Map(d.bank_transactions.map(x=>[x.id,x])),costs=new Map(d.company_costs.map(x=>[x.id,x])),pn=d.prima_nota_entries.map(x=>({...x}));
 let batch=[];const add=x=>{batch.push(x);if(batch.length>=30){batches.push(batch);batch=[];}};
 for(const p of pn){const b=bank.get(p.bank_transaction_id);if(!p.cost_id&&b?.linked_cost_id){const cost=costs.get(b.linked_cost_id);if(!cost)throw Error('Cross-tenant cost link');p.cost_id=cost.id;add(`update prima_nota_entries set cost_id=${q(cost.id)} where company_id=${q(C)} and id=${q(p.id)} and cost_id is null and bank_transaction_id=${q(b.id)};`);manifest.costLinks.push({pn:p.id,cost:cost.id});}}
 for(const f of d.fatture_ricevute.filter(x=>!x.prima_nota_id)){
  const candidates=pn.filter(p=>p.cost_id===f.company_cost_id&&p.direction==='uscita');
  if(candidates.length===1){add(`update fatture_ricevute set prima_nota_id=${q(candidates[0].id)} where company_id=${q(C)} and id=${q(f.id)} and prima_nota_id is null;`);manifest.receiptLinks.push({receipt:f.id,pn:candidates[0].id});}
 }
 const names={logistica:'DEMO - Logistica e noleggi di cantiere S.r.l.',materiali:'DEMO - Forniture e consumabili S.r.l.',immobili:'DEMO - Immobiliare magazzini S.r.l.',utenze:'DEMO - Energia e telecomunicazioni S.r.l.',servizi:'DEMO - Servizi e consulenze S.r.l.',flotta:'DEMO - Flotta e manutenzioni S.r.l.'};
 const supplierFor=c=>/trasport|nolegg|rifiuti/.test(c.category||'')?'logistica':/merci|materiali|Attrezzature/.test(c.category||'')?'materiali':/affitti|Immobili|struttura_immobili/.test(c.category||'')?'immobili':/Utenze|Telefonia|utenze|telefonia/.test(c.category||'')?'utenze':/carburante|manutenzione|Veicoli|leasing|Assicurazioni/.test(c.category||'')?'flotta':'servizi';
 const poReceipts=grouped(d.fatture_ricevute.filter(f=>f.purchase_order_id),'purchase_order_id');
 const represented=new Set(d.fatture_ricevute.map(f=>f.company_cost_id));
 for(const [po,fs]of poReceipts){const cs=d.company_costs.filter(c=>c.purchase_order_id===po);if(fs.length===1&&cents(sum(cs,'amount'))===cents(fs[0].imponibile_totale))for(const c of cs)represented.add(c.id);}
 const used=new Set();
 for(const c of d.company_costs.filter(c=>Number(c.vat_rate)>0&&!represented.has(c.id))){
  const date=c.paid_date||c.due_date;if(date>AS_OF){manifest.forecastCosts.push(c.id);continue;}
  if(!date)throw Error('Cost missing document date '+c.id);
  const kind=supplierFor(c),supplier=c.supplier_id?d.suppliers.find(s=>s.id===c.supplier_id):{id:uid('supplier:'+kind),name:names[kind]};if(!supplier)throw Error('Missing tenant supplier');
  if(!c.supplier_id&&!used.has(kind)){const row={id:supplier.id,company_id:C,name:supplier.name,email:`${kind}@fornitori-demo.invalid`,country:'Italia',city:'Milano',address:'Indirizzo dimostrativo',postal_code:'20100',province:'MI',is_active:true,payment_method:'bonifico_30gg',vat_rate:22,notes:MARK+' Identità fittizia, nessun invio o pagamento reale.'};add(insert('suppliers',row));manifest.suppliers.push(row);used.add(kind);}
  if(!c.supplier_id)add(`update company_costs set supplier_id=${q(supplier.id)} where company_id=${q(C)} and id=${q(c.id)} and supplier_id is null;`);
  const vat=Math.round(cents(c.amount)*Number(c.vat_rate)/100)/100,gross=(cents(c.amount)+cents(vat))/100,order=c.order_id||(c.allocations?.length===1?c.allocations[0].order_id:null),p=pn.filter(p=>p.cost_id===c.id&&p.direction==='uscita');
  const f={id:uid('received:'+c.id),company_id:C,numero_fattura:`DEMO-AUDIT-${date.slice(0,4)}-${c.id.slice(0,8)}`,data_fattura:date,tipo_documento:'TD01',cedente_ragione_sociale:supplier.name,cedente_paese:'IT',imponibile_totale:Number(c.amount),iva_totale:vat,totale_documento:gross,righe:[{descrizione:'DEMO - '+c.name,quantita:1,unita_misura:'corpo',prezzo_unitario:Number(c.amount),imponibile:Number(c.amount),aliquota_iva:String(c.vat_rate),imposta:vat,totale_riga:gross}],riepilogo_iva:[{aliquota_iva:String(c.vat_rate),imponibile:Number(c.amount),imposta:vat}],company_cost_id:c.id,purchase_order_id:c.purchase_order_id,order_id_suggerito:order,aggancio_oda_manuale:true,prima_nota_id:p.length===1?p[0].id:null,stato:'contabilizzata',note:MARK+' NON FISCALE. Documento sintetico del costo già salvato; nessun secondo costo, movimento o invio SDI.'};
  add(insert('fatture_ricevute',f));manifest.received.push(f);
 }
 if(batch.length)batches.push(batch);
 return {batches,manifest};
}
if(process.argv[1]?.endsWith('demo-company-accounting-documents.mjs')){
 guard();const mode=process.argv[2]||'plan';
 if(mode==='plan'){if(has('documents-applied'))throw Error('Preserve applied manifest');const p=build();save('documents-plan',p);console.log(JSON.stringify({batches:p.batches.length,counts:Object.fromEntries(Object.entries(p.manifest).filter(([k,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))}));}
 else{
  const p=read('documents-plan'),hash=digest(p);if(!['dry','apply'].includes(mode))throw Error('Unknown mode');if(mode==='apply'&&(!has('documents-dry')||read('documents-dry').hash!==hash||p.batches.some((_,i)=>!read('documents-dry').completed.includes(i))))throw Error('Complete rollback rehearsal required');
  const checkpoint=has('documents-'+mode)?read('documents-'+mode):{hash,completed:[]};if(checkpoint.hash!==hash)throw Error('Do not overwrite a different plan');
  // A rollback rehearsal must supply FK dependencies in EVERY independent batch.
  const dependencies=p.manifest.suppliers.map(s=>insert('suppliers',s)).join('\n');
  for(const [i,batch]of p.batches.entries()){if(checkpoint.completed.includes(i))continue;sql(`begin;${context}${dependencies}${batch.join('\n')}delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;${mode==='dry'?'rollback':'commit'};`);checkpoint.completed.push(i);save('documents-'+mode,checkpoint);if(i%5===0||i+1===p.batches.length)console.log(`${mode} ${i+1}/${p.batches.length}`);}
 }
}
