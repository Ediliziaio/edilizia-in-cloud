/** Private documents reconstructed from saved operational rows. Never sends or signs. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {C,A,q,sql,guard,context,insert} from './demo-company-accounting-audit.mjs';
import {uid,queues,serviceClient,has as closureHas,read as closureRead,sha as planSHA} from './demo-company-closure.mjs';
import {DIR,STAGE,MARK,AS_OF,read,save,has,protectedSQL} from './demo-company-operations.mjs';
import {render} from './demo-company-accounting-pdfs.mjs';
const clean=x=>String(x??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\u20ac\n]/g,''),money=n=>Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR',number=n=>Number(n).toLocaleString('it-IT',{maximumFractionDigits:3}),digest=x=>createHash('sha256').update(x).digest('hex');
export function documents(d,p){
 const out=[];
 for(const m of p.manifest.jobs){
  const o=d.orders.find(x=>x.id===m.id),s=d.surveys.find(x=>x.id===m.survey),r=d.supplier_rfqs.find(x=>x.id===m.rfq),po=d.purchase_orders.find(x=>x.id===m.po);
  if(!o||!s||!r||!po)throw Error('Operational sources not saved '+m.code);
  const es=d.survey_elements.filter(x=>x.survey_id===s.id).sort((a,b)=>a.position-b.position),items=d.supplier_rfq_items.filter(x=>x.rfq_id===r.id).sort((a,b)=>a.posizione-b.posizione),offers=d.supplier_rfq_suppliers.filter(x=>x.rfq_id===r.id),vendor=id=>d.suppliers.find(x=>x.id===id)?.name||'DEMO fornitore';
  out.push({id:s.id,order:o.id,kind:'survey',title:m.reviewed?'SOPRALLUOGO DI COORDINAMENTO - DEMO':'SOPRALLUOGO PIANIFICATO - DEMO',ref:s.code,date:m.reviewDate,details:[['Commessa',o.order_code],['Cliente',o.client_name],['Cantiere',s.address],['Data pianificata/rilevata',m.reviewDate],['Stato salvato',s.status],['Accessi',s.header_data.accessi],['Utenze',s.header_data.utenze],['Capitolato verificato',s.header_data.verifica_capitolato?'Si, simulazione':'Non ancora effettuato'],['Limite','Rilievo sintetico di coordinamento; non sostituisce un rilievo tecnico, foto, certificazione o firma.']],rows:es.map(e=>[e.values.descrizione+' | '+e.values.posa,e.values.quantita+' '+e.values.unita])});
  out.push({id:r.id,order:o.id,kind:'rfq',title:'RICHIESTA E CONFRONTO OFFERTE - DEMO',ref:r.rfq_number,date:r.created_at,details:[['Commessa',o.order_code],['ODA collegato',po.oda_number],['Stato salvato',r.status],['Scadenza offerte',r.scadenza_offerte],['Fabbisogno',r.data_fabbisogno],['Fornitore scelto',m.awarded?vendor(r.supplier_id_aggiudicato):'Non ancora aggiudicata'],['Netto ODA esistente',money(po.subtotal)],['Scelta',r.motivazione_scelta||'Da valutare'],['Avvertenza','Tre proposte fittizie inserite manualmente, nessuna email inviata. Nessun nuovo acquisto o costo.']],rows:[...items.map(i=>[i.descrizione,number(i.quantita)+' '+i.unita_misura]),...offers.map(v=>[vendor(v.supplier_id)+' | '+v.status+' | consegna '+v.giorni_consegna+' giorni',v.totale_offerto===null?'Da ricevere':money(v.totale_offerto)])]});
  for(const v of offers.filter(x=>x.status==='risposta')){
   const lines=d.supplier_rfq_quotes.filter(x=>x.rfq_supplier_id===v.id);
   if(lines.length!==items.length)throw Error('Offer rows incomplete '+v.id);
   out.push({id:v.id,order:o.id,kind:'offer',title:'OFFERTA FORNITORE SIMULATA - DEMO',ref:r.rfq_number+' / '+vendor(v.supplier_id),date:v.risposta_at,details:[['Fornitore fittizio',vendor(v.supplier_id)],['Commessa',o.order_code],['Risposta simulata',v.risposta_at.slice(0,10)],['Validita',v.validita_offerta],['Consegna',v.giorni_consegna+' giorni'],['Condizioni',v.condizioni_pagamento],['Totale netto',money(v.totale_offerto)],['Avvertenza','Offerta fittizia comparabile al capitolato DEMO. Nessuna email, firma, ordine o costo aggiuntivo.']],rows:items.map(i=>{const l=lines.find(x=>x.rfq_item_id===i.id);if(!l)throw Error('Offer item association missing');return [i.descrizione+' | '+number(i.quantita)+' '+i.unita_misura+' | IVA '+number(l.aliquota_iva)+'%',money(Number(i.quantita)*Number(l.prezzo_unitario))];})});
  }
 }
 return out;
}
function sources(){
 guard();const p=read('plan'),ids=p.manifest.jobs.map(x=>q(x.id)).join(','),d={company:C};
 for(const t of ['orders','surveys','survey_elements','supplier_rfqs','supplier_rfq_items','supplier_rfq_suppliers','supplier_rfq_quotes','purchase_orders','suppliers']){
  const scope=t==='orders'?`company_id=${q(C)} and id in(${ids})`:t==='survey_elements'?`survey_id in(select id from surveys where company_id=${q(C)} and notes like ${q(MARK+'%')})`:`company_id=${q(C)}`;
  d[t]=sql(`select * from ${t} where ${scope}`);
 }
 d.protected=sql(protectedSQL())[0].value;if(d.protected!==read('before').protected)throw Error('Financial graph changed during operation');save('pdf-sources',d);console.log({documents:documents(d,p).length,savedSurveys:d.surveys.filter(s=>p.manifest.jobs.some(m=>m.survey===s.id)).length});
}
async function author(mode){
 guard();const p=read('plan');if(!closureHas(STAGE+'-apply')||closureRead(STAGE+'-apply').hash!==planSHA(p)||closureRead(STAGE+'-apply').completed.length!==p.batches.length)throw Error('Verified applied graph required');
 const d=read('pdf-sources'),docs=documents(d,p),selected=mode==='preview'?['survey','rfq','offer'].map(k=>docs.find(x=>x.kind===k)).filter(Boolean):docs;
 const buckets=sql("select id,public from storage.buckets where id='order-attachments'");if(buckets.length!==1||buckets[0].public)throw Error('Private bucket required');
 const client=mode==='apply'?await serviceClient():null,out=DIR+'/pdfs';mkdirSync(out,{recursive:true,mode:0o700});
 const log=mode==='apply'&&has('pdf-'+mode)?read('pdf-'+mode):{company:C,expected:docs.length,completed:[]};
 if(client)sql(`begin;${context}${insert('order_document_folders',{id:p.manifest.folder,company_id:C,nome:'DEMO · Sopralluoghi e offerte',posizione:24,visibile_cliente:false,created_by:A})}commit;`);
 async function one(x){
  if(log.completed.some(a=>a.id===x.id&&a.kind===x.kind))return null;
  const bytes=await render(x),sha=digest(bytes),file=`${out}/${x.kind}-${x.id}.pdf`;writeFileSync(file,bytes,{mode:0o600});
  const txt=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!txt.includes('DEMO')||!txt.includes(clean(x.ref).slice(0,28))||/NaN|undefined/.test(txt))throw Error('PDF content incorrect '+x.id);
  const path=`orders/${x.order}/demo-operations/${x.kind}-${sha.slice(0,20)}.pdf`,updates=[];
  if(client){
   const {error}=await client.storage.from('order-attachments').upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Private upload failed');
   const {data,error:e}=await client.storage.from('order-attachments').download(path);if(e||digest(new Uint8Array(await data.arrayBuffer()))!==sha)throw Error('Downloaded document differs');
   if(x.kind==='offer')updates.push(`update supplier_rfq_suppliers set allegato_url=${q('order-attachments/'+path)} where company_id=${q(C)} and id=${q(x.id)} and allegato_url is null;`);
   if(x.kind==='survey'){const {data,error}=await client.storage.from('order-attachments').createSignedUrl(path,31536000);if(error)throw Error('Private survey link failed');updates.push(`update surveys set pdf_report_url=${q(data.signedUrl)} where company_id=${q(C)} and id=${q(x.id)} and pdf_report_url is null;`);}
   updates.push(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) select ${q(uid(STAGE+':pdf-'+x.kind+'-'+x.id))},id,${q('DEMO - '+x.title+' - '+x.ref+'.pdf')},${q(path)},'application/pdf',${bytes.length},${q(A)},${q(p.manifest.folder)},false from orders where company_id=${q(C)} and id=${q(x.order)} on conflict(id) do nothing;`);
  }
  return {id:x.id,kind:x.kind,order:x.order,path,file,sha,bytes:bytes.length,downloadVerified:!!client,updates};
 }
 for(let i=0;i<selected.length;i+=8){
  const result=(await Promise.all(selected.slice(i,i+8).map(one))).filter(Boolean);
  if(client&&result.length)sql(`begin;${context}${result.flatMap(x=>x.updates).join('\n')}${queues}do $$begin if (${protectedSQL()}) is distinct from ${q(d.protected)} then raise exception 'Private documents changed financial or stock amounts';end if;end $$;commit;`);
  log.completed.push(...result.map(({updates,...x})=>x));save('pdf-'+mode,log);if(i%80===0||i+8>=selected.length)console.log(`Operations PDF ${mode}: ${log.completed.length}/${selected.length}`);
 }
}
if(process.argv[1]?.endsWith('demo-company-operations-pdfs.mjs')){
 const mode=process.argv[2]||'sources';if(mode==='sources')sources();else if(['preview','apply'].includes(mode))await author(mode);else if(mode==='count')console.log({count:documents(read('pdf-sources'),read('plan')).length});else throw Error('sources | count | preview | apply');
}
