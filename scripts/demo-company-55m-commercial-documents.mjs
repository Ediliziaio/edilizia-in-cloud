/** Private demo archives rendered from saved sources. No fiscal sending/signing. */
import {C,A,MARK,DIR,uid,q,read,save,sql,guard,context} from './demo-company-55m.mjs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const mode=process.argv[2]||'preview';if(!['preview','apply'].includes(mode))throw Error('Invalid mode');
guard();const d=read('after'),s=read('integration2-document-sources'),m=read('integration2-manifest');
const ownJobs=new Set(read('business-manifest').orders.map(o=>o.id));
const folder=(name,fallback)=>s.folders.find(f=>f.nome===name)?.id||fallback;
const quotesFolder=folder('Preventivi'),invoiceFolder=folder('Fatture e pagamenti'),purchaseFolder=uid('integration2-purchase-folder'),salFolder=uid('integration2-sal-folder');
const out=DIR+'/commercial-pdfs';mkdirSync(out,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const money=v=>Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR';
const clean=v=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\u20ac\n]/g,'');
const documents=[];
const order=id=>d.orders.find(o=>o.id===id);
const add=(kind,id,title,ref,rows,detail,options={})=>documents.push({kind,id,title,ref,rows,detail,...options});
for(const x of s.quotes){
 const o=order(m.quotes.find(v=>v.id===x.id)?.orderId);if(!o)throw Error('Quote without saved job');
 add('quote',x.id,'PREVENTIVO DIMOSTRATIVO',x.quote_number,s.quote_items.filter(i=>i.quote_id===x.id).sort((a,b)=>a.sort_order-b.sort_order).map(i=>[i.name,money(i.line_total)]),[['Cliente',x.client_name],['Commessa',o.order_code],['Imponibile',money(x.subtotal)],['IVA',money(x.vat_amount)],['Totale',money(x.total)]],{order:o.id,folder:quotesFolder,record:x});
}
for(const x of d.documenti_fiscali.filter(f=>ownJobs.has(f.ordine_id)&&f.numero?.startsWith('DEMO55-'))){
 const o=order(x.ordine_id),delta=Number((Number(x.imponibile_totale)+Number(x.iva_totale)-Number(x.totale_documento)).toFixed(2));
 add('invoice',x.id,'FATTURA DIMOSTRATIVA',x.numero,(x.righe||[]).map(r=>[r.descrizione,money(r.totale_riga??r.totale)]),[['Cliente',x.cliente_snapshot?.ragione_sociale||o.client_name],['Commessa',o.order_code],['Data',x.data_emissione],['Scadenza',x.data_scadenza],['Imponibile',money(x.imponibile_totale)],['IVA registrata',money(x.iva_totale)],['Totale documento',money(x.totale_documento)],['Incassato',money(x.importo_pagato)],...(delta?[['Verifica richiesta','Arrotondamento storico '+money(delta)+'. Originale emesso preservato; non rettificato in questa copia.']]:[])],{order:o.id,folder:invoiceFolder,record:x});
}
for(const x of s.sal){
 const o=order(x.order_id),row=m.sal.find(v=>v.id===x.id),previous=s.sal.filter(v=>v.order_id===x.order_id&&v.numero_sal<x.numero_sal).sort((a,b)=>b.numero_sal-a.numero_sal)[0];
 const increment=(Math.round(Number(x.importo_totale)*100)-Math.round(Number(previous?.importo_totale||0)*100))/100;
 add('sal',x.id,'VERBALE SAL - NON FIRMATO',o.order_code+' / SAL '+x.numero_sal,s.sal_voci.filter(v=>v.sal_id===x.id).map(v=>[v.descrizione+' - '+v.percentuale_avanzamento+'%',money(v.importo_sal)]),[['Cliente',o.client_name],['Data',x.data_emissione],['Importo contrattuale',money(o.total_amount)],['Avanzamento cumulativo',row.pct+'%'],['Valore cumulativo netto',money(x.importo_totale)],['Incremento di questo SAL netto',money(increment)],['Acconto','Acconto contrattuale compensato nel SAL; nessun secondo incasso.'],['Stato','Approvazione simulata; nessuna firma cliente reale.']],{order:o.id,folder:salFolder,record:x});
}
for(const x of d.purchase_orders.filter(p=>ownJobs.has(p.order_id))){
 const o=order(x.order_id),supplier=d.suppliers.find(v=>v.id===x.supplier_id);
 add('purchase',x.id,'ORDINE DI ACQUISTO DIMOSTRATIVO',x.oda_number,d.purchase_order_items.filter(i=>i.purchase_order_id===x.id).map(i=>[i.description||i.name,money(i.line_total)]),[['Fornitore',supplier?.name],['Commessa',o.order_code],['Data',x.issue_date],['Consegna',x.actual_delivery_date],['Imponibile',money(x.subtotal)],['IVA',money(x.vat_total)],['Totale',money(x.total)],['Stato',x.status]],{order:o.id,folder:purchaseFolder,record:x});
 const ddt=d.ddt_ricezione.find(v=>v.purchase_order_id===x.id);if(!ddt)throw Error('Missing saved DDT');
 add('ddt',ddt.id,'DOCUMENTO DI TRASPORTO - DEMO',ddt.numero_ddt,d.purchase_order_items.filter(i=>i.purchase_order_id===x.id).map(i=>[i.description||i.name,String(i.quantity)+' '+(i.unit_of_measure||'corpo')]),[['Fornitore',supplier?.name],['Destinazione',o.work_address],['Commessa',o.order_code],['ODA',x.oda_number],['Ricezione',ddt.data_ricezione],['Ricevuto da',ddt.ricevuto_da_nome],['Esito','Verifica simulata, nessuna firma reale.'],['Contabilizzazione','Fornitura diretta già imputata con ODA; nessun doppio carico di scorta.']],{order:o.id,folder:purchaseFolder,record:ddt});
}
for(const x of d.fatture_ricevute.filter(f=>f.note?.includes(MARK))){
 const po=d.purchase_orders.find(p=>p.id===x.purchase_order_id);
 // Subcontractor invoices have no material PO, but have a saved job/cost link.
 const o=order(po?.order_id||x.order_id_suggerito);
 add('received',x.id,'FATTURA FORNITORE - DEMO',x.numero_fattura,(x.righe||[]).map(r=>[r.descrizione,money(Number(r.quantita||1)*Number(r.prezzo_unitario||0))]),[['Fornitore',x.cedente_ragione_sociale],['Data',x.data_fattura],['Commessa',o?.order_code||'Struttura / costi comuni'],['Imponibile',money(x.imponibile_totale)],['IVA',money(x.iva_totale)],['Totale',money(x.totale_documento)],['Costo collegato',x.company_cost_id||'Verificare contabilizzazione']],{order:o?.id,folder:invoiceFolder,record:x});
}
for(const x of d.hr_cedolini.filter(c=>c.note?.includes(MARK))){
 const e=d.employees.find(e=>e.id===x.employee_id);if(!e)throw Error('Missing payroll employee');
 add('payroll',x.id,'CEDOLINO SIMULATO - NON UFFICIALE',x.anno+'-'+String(x.mese).padStart(2,'0')+' / '+e.first_name+' '+e.last_name,[['Retribuzione lorda',money(x.lordo)],['Contributi dipendente simulati',money(x.contributi_dipendente)],['Ritenute simulate',money(x.ritenute_irpef)],['Netto simulato',money(x.netto)],['Contributi datore simulati',money(x.contributi_datore)]],[['Dipendente',e.first_name+' '+e.last_name],['Periodo',x.mese+'/'+x.anno],['Ore lavorate',String(x.ore_lavorate)],['Straordinario',String(x.ore_straordinario)],['Stato',x.stato],['Avvertenza','Aliquote sintetiche: non busta paga legale, non consulenza del lavoro, nessun F24 o bonifico reale.']],{record:x});
}
async function render(x){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);let page,y,pages=[];
 const wrap=(text,width,size=10,f=font)=>{const lines=[];for(const paragraph of clean(text).split('\n')){let line='';for(let word of paragraph.split(/\s+/)){while(f.widthOfTextAtSize(word,size)>width){let i=1;while(i<word.length&&f.widthOfTextAtSize(word.slice(0,i+1),size)<=width)i++;if(line){lines.push(line);line='';}lines.push(word.slice(0,i));word=word.slice(i);}const test=line?line+' '+word:word;if(f.widthOfTextAtSize(test,size)>width&&line){lines.push(line);line=word;}else line=test;}lines.push(line);}return lines;};
 const newPage=()=>{page=pdf.addPage([595,842]);pages.push(page);page.drawRectangle({x:0,y:764,width:595,height:78,color:rgb(.075,.19,.32)});page.drawText('DEMO AZIENDA 2',{x:36,y:807,font:bold,size:13,color:rgb(1,1,1)});page.drawText(clean(x.title),{x:36,y:783,font:bold,size:11,color:rgb(1,.65,.22)});y=742;};
 const text=(v,size=10,f=font)=>{for(const line of wrap(v,523,size,f)){if(y<65)newPage();page.drawText(line,{x:36,y,font:f,size,color:rgb(.12,.16,.22)});y-=size+5;}};
 newPage();text(x.ref,13,bold);y-=8;text('DEMO - NON VALIDO AI FINI FISCALI O CONTRATTUALI',9,bold);text('Dati e soggetti di simulazione. Nessun invio, firma o pagamento reale.',9);y-=12;
 for(const [label,value]of x.detail){text(label+': '+(value??'Non disponibile'),10);}
 y-=14;text('DETTAGLIO',10,bold);y-=4;
 for(const [label,value]of x.rows){const lines=wrap(label,375,10),height=Math.max(28,lines.length*14+12);if(y-height<65)newPage();page.drawRectangle({x:32,y:y-height+8,width:531,height,borderColor:rgb(.87,.9,.94),borderWidth:.5,color:rgb(.975,.98,.99)});let yy=y-7;for(const l of lines){page.drawText(l,{x:40,y:yy,font,size:10,color:rgb(.12,.16,.22)});yy-=14;}const v=clean(value);page.drawText(v,{x:550-bold.widthOfTextAtSize(v,10),y:y-7,font:bold,size:10,color:rgb(.075,.19,.32)});y-=height;}
 for(const [i,p]of pages.entries()){p.drawText('Archivio dimostrativo - fonte: dati salvati - nessuna firma',{x:36,y:35,font,size:8,color:rgb(.4,.45,.5)});p.drawText(`${i+1}/${pages.length}`,{x:535,y:35,font,size:8,color:rgb(.4,.45,.5)});}
 pdf.setTitle(clean(x.title+' '+x.ref));pdf.setAuthor('Demo Azienda 2 - simulazione');pdf.setCreationDate(new Date('2026-10-09T20:00:00Z'));pdf.setModificationDate(new Date('2026-10-09T20:00:00Z'));
 return pdf.save();
}
// A network interruption must not leave the archival job waiting indefinitely.
// Object writes are content-addressed and checked on retry; never overwrite.
async function boundedFetch(input,init={}){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const timeout=AbortSignal.timeout(25000);
   return await fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});
  }catch(error){if(attempt===2||init.signal?.aborted)throw error;}
 }
}
let client;if(mode==='apply'){const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('No storage authorization');client=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});}
const bucketFor={quote:'quote-pdfs',invoice:'documenti-fiscali',sal:'order-attachments',purchase:'order-attachments',ddt:'ddt_attachments',received:'documenti-smart',payroll:'hr-documenti'};
const buckets=read('integration2-buckets');if(Object.values(bucketFor).some(b=>!buckets.find(x=>x.id===b&&!x.public)))throw Error('Private storage required');
const seen=new Set(),selected=documents.filter(x=>mode==='apply'||!seen.has(x.kind)&&seen.add(x.kind));
let log=mode==='apply'&&existsSync(`${DIR}/commercial-documents-${mode}.json`)?read('commercial-documents-'+mode):{company:C,total:documents.length,completed:[]};
async function upload(bucket,path,bytes){const {error}=await client.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error){const {data,error:err}=await client.storage.from(bucket).download(path);if(err||sha(new Uint8Array(await data.arrayBuffer()))!==sha(bytes))throw Error('Storage conflict '+path);}}
async function one(x){
 if(log.completed.some(v=>v.id===x.id&&v.kind===x.kind))return null;
 const bytes=await render(x),digest=sha(bytes),file=`${out}/${x.kind}-${x.id}.pdf`;writeFileSync(file,bytes,{mode:0o600});
 const extracted=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!extracted.includes('DEMO')||!extracted.includes(clean(x.ref).slice(0,35))||extracted.includes('NaN')||extracted.includes('undefined'))throw Error('Incomplete rendered content '+x.ref);
 const bucket=bucketFor[x.kind],path=bucket==='order-attachments'?`orders/${x.order}/demo-55m/${x.kind}-${digest.slice(0,20)}.pdf`:`${C}/${x.id}/demo-${digest.slice(0,20)}.pdf`,updates=[];
 if(client){
  await upload(bucket,path,bytes);
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,31536000);if(error)throw error;const signed=data.signedUrl;
  const tables={quote:'quotes',invoice:'documenti_fiscali',ddt:'ddt_ricezione',received:'fatture_ricevute',payroll:'hr_cedolini'};
  if(tables[x.kind]){
   const patch=x.kind==='quote'?`pdf_storage_path=${q(path)},pdf_generated_at=now()` :x.kind==='ddt'?`ddt_file_url=${q(signed)},ddt_file_name=${q('DEMO-'+x.ref+'.pdf')},ddt_file_mime='application/pdf'` :x.kind==='received'?`pdf_storage_bucket=${q(bucket)},pdf_storage_path=${q(path)},pdf_url=${q(signed)}`: `pdf_url=${q(x.kind==='invoice'?path:signed)}`;
   const empty=x.kind==='quote'?'pdf_storage_path is null':x.kind==='ddt'?'ddt_file_url is null':x.kind==='received'?'pdf_storage_path is null':'pdf_url is null';
   updates.push(`update ${tables[x.kind]} set ${patch} where id=${q(x.id)} and company_id=${q(C)} and (${empty} or ${x.kind==='quote'?'pdf_storage_path':x.kind==='ddt'?'ddt_file_url':x.kind==='received'?'pdf_storage_path':'pdf_url'} like '%/demo-%');`);
  }
  if(x.order){
   const ap=bucket==='order-attachments'?path:`orders/${x.order}/demo-55m/${x.kind}-${digest.slice(0,20)}.pdf`;
   if(bucket!=='order-attachments')await upload('order-attachments',ap,bytes);
   updates.push(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) values(${q(uid('integration2-attachment-'+x.kind+'-'+x.id))},${q(x.order)},${q('DEMO - '+x.title+' - '+x.ref+'.pdf')},${q(ap)},'application/pdf',${bytes.length},${q(A)},${q(x.folder)},false) on conflict(id) do nothing;`);
  }
  // Download every archived source once: object presence alone isn't verification.
  const {data:saved,error:err}=await client.storage.from(bucket).download(path);if(err||sha(new Uint8Array(await saved.arrayBuffer()))!==digest)throw Error('Archive verification failed');
 }
 return {id:x.id,kind:x.kind,ref:x.ref,file,sha256:digest,bucket,path,bytes:bytes.length,updates};
}
if(client)sql(`begin;${context}insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values(${q(purchaseFolder)},${q(C)},'DEMO · Acquisti e DDT',11,false,${q(A)}),(${q(salFolder)},${q(C)},'DEMO · SAL e avanzamento',12,false,${q(A)}) on conflict(id) do nothing;commit;`);
for(let i=0;i<selected.length;i+=8){
 const result=(await Promise.all(selected.slice(i,i+8).map(one))).filter(Boolean);
 if(client&&result.length)sql(`begin;${context}${result.flatMap(r=>r.updates).join('\n')}delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;commit;`);
 if(result.length){log.completed.push(...result.map(({updates,...r})=>r));save('commercial-documents-'+mode,log);console.log(mode.toUpperCase(),log.completed.length+'/'+documents.length);}
}
console.log({total:documents.length,completed:log.completed.length,byKind:documents.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),outbound:0});
