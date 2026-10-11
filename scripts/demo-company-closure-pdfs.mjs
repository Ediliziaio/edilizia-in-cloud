/** Verified private assets for the reconstructed 2025 documents, never sending. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {C,A,DIR,MARK,q,j,sql,context,guard,uid,read,save,has,serviceClient,queues} from './demo-company-closure.mjs';
import {render} from './demo-company-accounting-pdfs.mjs';
const mode=process.argv[2]||'sources',money=x=>Number(x||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),out=DIR+'/pdfs';
guard();if(!has('sales-2025-apply')||read('sales-2025-apply').completed.length!==48)throw Error('Completed reconstruction required');
const manifest=read('sales-2025-plan').manifest,jobIds=manifest.orders.map(x=>q(x.id)).join(',');
if(mode==='sources'){
 const s={company:C};
 for(const t of ['orders','quotes','quote_items','documenti_fiscali','sal_records','sal_voci','order_attachments']){
  const scope=t==='orders'?`company_id=${q(C)} and id in(${jobIds})`:t==='documenti_fiscali'?`company_id=${q(C)} and id in(${manifest.documents.map(x=>q(x.id))})`:t==='quotes'?`company_id=${q(C)} and id in(${manifest.quotes.map(x=>q(x.id))})`:t==='quote_items'?`company_id=${q(C)} and quote_id in(${manifest.quotes.map(x=>q(x.id))})`:t==='sal_voci'?`sal_id in(${manifest.sals.map(x=>q(x.id))})`:t==='order_attachments'?`order_id in(select id from orders where company_id=${q(C)} and id in(${jobIds}))`:`company_id=${q(C)} and order_id in(${jobIds})`;
  s[t]=sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]') rows from(select * from ${t} where ${scope})r`)[0].rows;
 }
 s.buckets=sql("select id,public from storage.buckets where id in('quote-pdfs','documenti-fiscali','order-attachments')");save('pdf-sources',s);console.log({orders:s.orders.length,invoices:s.documenti_fiscali.length,quotes:s.quotes.length,sals:s.sal_records.length});process.exit(0);
}
if(!['preview','apply'].includes(mode))throw Error('Unknown PDF mode');
const s=read('pdf-sources'),items=[],order=id=>s.orders.find(o=>o.id===id);
for(const d of s.documenti_fiscali){const o=order(d.ordine_id);items.push({id:d.id,kind:'invoice',bucket:'documenti-fiscali',order:o.id,title:'FATTURA DEMO - NON FISCALE',ref:d.numero,date:d.data_emissione,details:[['Cliente',o.client_name],['Commessa',o.order_code],['Emissione simulata',d.data_emissione],['Scadenza',d.data_scadenza],['Imponibile',money(d.imponibile_totale)],['IVA',money(d.iva_totale)],['Totale',money(d.totale_documento)],['Incassato simulato',money(d.importo_pagato)],['Stato salvato',d.stato]],rows:d.righe.map(r=>[r.descrizione+' (IVA inclusa)',money(r.totale)])});}
for(const d of s.quotes){const o=s.orders.find(o=>o.quote_id===d.id);items.push({id:d.id,kind:'quote',bucket:'quote-pdfs',order:o.id,title:'PREVENTIVO DEMO - NON CONTRATTUALE',ref:d.quote_number,date:d.created_at.slice(0,10),details:[['Cliente',o.client_name],['Commessa',o.order_code],['Data del preventivo',d.created_at.slice(0,10)],['Imponibile',money(d.subtotal)],['IVA',money(d.vat_amount)],['Totale',money(d.total)],['Stato','Convertito nella commessa; nessuna firma reale']],rows:s.quote_items.filter(i=>i.quote_id===d.id).sort((a,b)=>a.sort_order-b.sort_order).map(r=>[r.name,money(r.line_total)])});}
for(const d of s.sal_records){const o=order(d.order_id),previous=s.sal_records.filter(x=>x.order_id===d.order_id&&x.numero_sal<d.numero_sal).sort((a,b)=>b.numero_sal-a.numero_sal)[0];items.push({id:d.id,kind:'sal',bucket:'order-attachments',order:o.id,title:'SAL CUMULATIVO DEMO - NON FIRMATO',ref:o.order_code+' / SAL '+d.numero_sal,date:d.data_emissione,details:[['Cliente',o.client_name],['Commessa',o.order_code],['Data',d.data_emissione],['Contratto netto',money(o.total_amount)],['Cumulativo netto',money(d.importo_totale)],['Incremento netto',money(d.importo_totale-Number(previous?.importo_totale||0))],['Pagamento','Verbale cumulativo; non crea un nuovo incasso']],rows:s.sal_voci.filter(v=>v.sal_id===d.id).map(r=>[r.descrizione,r.percentuale_avanzamento+'% - '+money(r.importo_sal)])});}
if(items.length!==300||s.buckets.length!==3||s.buckets.some(x=>x.public))throw Error('Wrong PDF cohort/private buckets');
mkdirSync(out,{recursive:true,mode:0o700});
const selected=mode==='preview'?['invoice','quote','sal'].map(k=>items.find(x=>x.kind===k)):items;
const log=has('pdf-'+mode)?read('pdf-'+mode):{company:C,total:items.length,completed:[]};
const client=mode==='apply'?await serviceClient():null,folder=uid('2025-documents-current'),archiveFolder=uid('2025-documents-superseded');
if(client)sql(`begin;${context}insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values(${q(folder)},${q(C)},'DEMO - Storico 2025 verificato',22,false,${q(A)}),(${q(archiveFolder)},${q(C)},'DEMO - Documenti sostituiti (2025)',23,false,${q(A)}) on conflict(id) do nothing;commit;`);
async function upload(bucket,path,bytes){const {error}=await client.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Private upload failed '+path);const {data,error:e}=await client.storage.from(bucket).download(path);if(e||digest(new Uint8Array(await data.arrayBuffer()))!==digest(bytes))throw Error('Stored PDF bytes mismatch '+path);}
async function one(x){
 if(log.completed.some(r=>r.kind===x.kind&&r.id===x.id))return null;
 const bytes=await render(x),hash=digest(bytes),file=`${out}/${x.kind}-${x.id}.pdf`;writeFileSync(file,bytes,{mode:0o600});
 const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!text.includes('NON FISCALE')||text.includes('NaN')||text.includes('undefined')||!text.includes(x.ref.replaceAll('·','').slice(0,20)))throw Error('Malformed PDF '+x.ref);
 const ap=`orders/${x.order}/demo-closure-2025/${x.kind}-${hash.slice(0,20)}.pdf`,path=x.bucket==='order-attachments'?ap:`${C}/${x.id}/demo-closure-2025-${hash.slice(0,20)}.pdf`,updates=[];
 if(client){
  await upload(x.bucket,path,bytes);if(x.bucket!=='order-attachments')await upload('order-attachments',ap,bytes);
  if(x.kind==='invoice'){const {data,error}=await client.storage.from(x.bucket).createSignedUrl(path,31536000);if(error)throw Error('Private URL failed');updates.push(`update documenti_fiscali set pdf_url=${q(path)} where company_id=${q(C)} and id=${q(x.id)};update invoices set pdf_url=${q(data.signedUrl)},pdf_generated_at=now() where company_id=${q(C)} and id=${q(x.id)};`);}
  if(x.kind==='quote')updates.push(`update quotes set pdf_storage_path=${q(path)},pdf_generated_at=now() where company_id=${q(C)} and id=${q(x.id)};`);
  const old=s.order_attachments.filter(a=>a.order_id===x.order&&a.file_name?.startsWith('DEMO')&&(x.kind==='invoice'?a.file_name.includes(manifest.documents.find(d=>d.id===x.id).number.replace('DEMO47-','DEMO55-')):a.file_name.includes(x.ref)));
  for(const a of old)updates.push(`update order_attachments set folder_id=${q(archiveFolder)},visible_to_customer=false,file_name=${q('SOSTITUITO - '+a.file_name)} where id=${q(a.id)} and order_id in(select id from orders where company_id=${q(C)} and id=${q(x.order)}) and file_name=${q(a.file_name)};`);
  updates.push(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) select ${q(uid('2025-attachment:'+x.kind+':'+x.id))},id,${q('DEMO - '+x.title+' - '+x.ref+'.pdf')},${q(ap)},'application/pdf',${bytes.length},${q(A)},${q(folder)},false from orders where company_id=${q(C)} and id=${q(x.order)} on conflict(id) do nothing;`);
 }
 return {id:x.id,kind:x.kind,file,bucket:x.bucket,path,attachmentPath:ap,sha:hash,bytes:bytes.length,updates};
}
for(let i=0;i<selected.length;i+=8){const rs=(await Promise.all(selected.slice(i,i+8).map(one))).filter(Boolean);if(client&&rs.length)sql(`begin;${context}${rs.flatMap(x=>x.updates).join('\n')}${queues}commit;`);log.completed.push(...rs.map(({updates,...r})=>r));save('pdf-'+mode,log);if(i%48===0||i+8>=selected.length)console.log(`PDF ${mode} ${log.completed.length}/${selected.length}`);}
