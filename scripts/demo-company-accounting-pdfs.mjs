/** Private, watermarked archive PDFs, with byte verification and resumable checkpoints. */
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {C,A,AS_OF,MARK,DIR,q,sql,guard,context,read,save,has} from './demo-company-accounting-audit.mjs';
import {uid} from './demo-company-accounting-repair.mjs';
const clean=x=>String(x??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\u20ac\n]/g,'');
const money=x=>Number(x||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function documents(s){
 const out=[],o=id=>s.orders.find(o=>o.id===id),row=r=>[r.descrizione||r.description||'Voce salvata',money(r.totale_riga??r.totale??r.importo??r.imponibile)];
 for(const f of s.documenti_fiscali.filter(f=>f.tipo==='fattura'&&!f.deleted_at&&!['bozza','annullata'].includes(f.stato)&&!f.pdf_url)){
  const associations=s.fattura_ordine.filter(a=>a.fattura_id===f.id);
  const order=o(f.ordine_id)||(associations.length===1?o(associations[0].ordine_id):undefined),a=s.anagrafiche_native.find(a=>a.id===f.anagrafica_id);
  out.push({id:f.id,kind:'invoice',bucket:'documenti-fiscali',title:'FATTURA DEMO - NON FISCALE',ref:f.numero,date:f.data_emissione,order:order?.id,details:[['Cliente',order?.client_name||f.cliente_snapshot?.ragione_sociale||f.cliente_snapshot?.nome||a?.ragione_sociale||'Anagrafica non presente nel documento'],['Commessa',order?.order_code||'Documento senza commessa diretta'],['Emissione simulata',f.data_emissione],['Scadenza',f.data_scadenza||'Non indicata'],['Imponibile',money(f.imponibile_totale)],['IVA',money(f.iva_totale)],['Totale documento',money(f.totale_documento)],['Incassato simulato',money(f.importo_pagato)],['Stato salvato',f.stato]],rows:(f.righe||[]).map(row)});
 }
 for(const f of s.fatture_ricevute.filter(f=>!f.pdf_url||f.id==='5aae4b29-3294-4e9b-a171-140db3d6979e')){
  const order=o(f.order_id_suggerito),cost=s.company_costs.find(c=>c.id===f.company_cost_id);
  out.push({id:f.id,kind:'received',bucket:'documenti-smart',title:'FATTURA FORNITORE DEMO - NON FISCALE',ref:f.numero_fattura,date:f.data_fattura,order:order?.id,details:[['Fornitore',f.cedente_ragione_sociale],['Data del documento simulato',f.data_fattura],['Commessa',order?.order_code||'Struttura aziendale'],['Imponibile',money(f.imponibile_totale)],['IVA',money(f.iva_totale)],['Totale documento',money(f.totale_documento)],['Costo associato',cost?.name||'Non associato'],['Stato del costo',cost?.is_paid?'Pagamento già registrato nel costo':'Da pagare - nessun pagamento creato'],['Prima nota associata',f.prima_nota_id||'Nessun collegamento univoco disponibile']],rows:(f.righe||[]).map(row)});
 }
 return out;
}
export async function render(x){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),pages=[];let page,y;
 const wrap=(value,width,size=10,f=font)=>{const result=[];for(const paragraph of clean(value).split('\n')){let line='';for(let word of paragraph.split(/\s+/)){while(f.widthOfTextAtSize(word,size)>width){let n=1;while(n<word.length&&f.widthOfTextAtSize(word.slice(0,n+1),size)<=width)n++;if(line){result.push(line);line='';}result.push(word.slice(0,n));word=word.slice(n);}const next=line?line+' '+word:word;if(f.widthOfTextAtSize(next,size)>width&&line){result.push(line);line=word;}else line=next;}result.push(line);}return result;};
 const newPage=()=>{page=pdf.addPage([595,842]);pages.push(page);page.drawRectangle({x:0,y:755,width:595,height:87,color:rgb(.075,.19,.32)});page.drawText('DEMO AZIENDA 2',{x:36,y:807,font:bold,size:13,color:rgb(1,1,1)});for(const [i,line]of wrap(x.title,523,10,bold).entries())page.drawText(line,{x:36,y:785-i*14,font:bold,size:10,color:rgb(1,.65,.22)});y=734;};
 const text=(value,size=10,f=font)=>{for(const line of wrap(value,523,size,f)){if(y<65)newPage();page.drawText(line,{x:36,y,font:f,size,color:rgb(.12,.16,.22)});y-=size+5;}};
 newPage();text(x.ref,12,bold);y-=7;text('DEMO - NON FISCALE / SENZA FIRME / NON TRASMESSA A SDI',9,bold);text('Copia dimostrativa dei dati salvati. Nessun costo o pagamento aggiuntivo.',9);y-=12;
 for(const [k,v]of x.details)text(k+': '+(v??'Non indicato nel dato di origine'));y-=12;text('DETTAGLIO DEL DOCUMENTO SALVATO',10,bold);
 if(!x.rows.length)text('Nessuna riga presente nel dato di origine. Non sono state inventate voci.',9);
 for(const [label,value]of x.rows){const l=wrap(label,365),r=wrap(value,125),height=Math.max(28,Math.max(l.length,r.length)*14+12);if(y-height<65)newPage();page.drawRectangle({x:32,y:y-height+8,width:531,height,borderColor:rgb(.87,.9,.94),borderWidth:.5,color:rgb(.975,.98,.99)});for(const [i,line]of l.entries())page.drawText(line,{x:40,y:y-7-i*14,font,size:10,color:rgb(.12,.16,.22)});for(const [i,line]of r.entries())page.drawText(line,{x:550-bold.widthOfTextAtSize(line,10),y:y-7-i*14,font:bold,size:10,color:rgb(.075,.19,.32)});y-=height;}
 for(const [i,p]of pages.entries()){p.drawText('Archivio sintetico - nessuna validita fiscale o contrattuale',{x:36,y:35,font,size:8,color:rgb(.4,.45,.5)});p.drawText(`${i+1}/${pages.length}`,{x:535,y:35,font,size:8,color:rgb(.4,.45,.5)});}
 pdf.setTitle(clean(x.title+' '+x.ref));pdf.setAuthor('Demo Azienda 2 - simulazione');pdf.setCreationDate(new Date(AS_OF+'T12:00:00Z'));pdf.setModificationDate(new Date(AS_OF+'T12:00:00Z'));return pdf.save();
}
if(process.argv[1]?.endsWith('demo-company-accounting-pdfs.mjs')){
 guard();const mode=process.argv[2]||'count',s=read('latest');
 const items=documents(s);if(mode==='count'){console.log(JSON.stringify({documents:items.length,invoice:items.filter(x=>x.kind==='invoice').length,received:items.filter(x=>x.kind==='received').length}));process.exit(0);}
 if(!['preview','apply'].includes(mode))throw Error('Unknown mode');
 const out=DIR+'/pdfs';mkdirSync(out,{recursive:true,mode:0o700});
 let client;
 if(mode==='apply'){
  const buckets=sql("select id,public from storage.buckets where id in('documenti-fiscali','documenti-smart','order-attachments')");if(buckets.length!==3||buckets.some(x=>x.public))throw Error('Only private buckets');
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('No storage authorization');client=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(25000)})}});
 }
 const folder=uid('documents-folder'),selected=mode==='preview'?[items.find(x=>x.kind==='invoice'&&s.documenti_fiscali.some(f=>f.id===x.id&&f.imponibile_totale>0)),items.find(x=>x.kind==='received')].filter(Boolean):items;
 if(client)sql(`begin;${context}insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values(${q(folder)},${q(C)},'DEMO - Archivio contabile verificato',21,false,${q(A)}) on conflict(id) do nothing;commit;`);
 const log=has('pdf-'+mode)?read('pdf-'+mode):{company:C,expected:items.length,completed:[]};
 async function upload(bucket,path,bytes){const {error}=await client.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Upload failed: '+path);const {data,error:e}=await client.storage.from(bucket).download(path);if(e||sha(new Uint8Array(await data.arrayBuffer()))!==sha(bytes))throw Error('Stored PDF differs: '+path);}
 async function one(x){
  if(log.completed.some(v=>v.id===x.id&&v.kind===x.kind))return null;
  const bytes=await render(x),digest=sha(bytes),file=`${out}/${x.kind}-${x.id}.pdf`;writeFileSync(file,bytes,{mode:0o600});const extracted=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!extracted.includes('NON FISCALE')||extracted.includes('NaN')||extracted.includes('undefined')||!extracted.includes(clean(x.ref).slice(0,25)))throw Error('PDF validation failed '+x.id);
  const path=`${C}/${x.id}/demo-accounting-${digest.slice(0,20)}.pdf`,updates=[];
  if(client){await upload(x.bucket,path,bytes);const {data,error}=await client.storage.from(x.bucket).createSignedUrl(path,31536000);if(error)throw Error('Private URL failed');
   updates.push(x.kind==='invoice'?`update documenti_fiscali set pdf_url=${q(path)} where company_id=${q(C)} and id=${q(x.id)} and pdf_url is null;update invoices set pdf_url=${q(data.signedUrl)},pdf_generated_at=now() where company_id=${q(C)} and id=${q(x.id)} and pdf_url is null;`:`update fatture_ricevute set pdf_storage_bucket=${q(x.bucket)},pdf_storage_path=${q(path)},pdf_url=${q(data.signedUrl)} where company_id=${q(C)} and id=${q(x.id)};`);
   if(x.order){const ap=`orders/${x.order}/demo-accounting/${x.kind}-${digest.slice(0,20)}.pdf`;await upload('order-attachments',ap,bytes);updates.push(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) select ${q(uid('attachment:'+x.kind+':'+x.id))},id,${q('DEMO - '+x.ref+'.pdf')},${q(ap)},'application/pdf',${bytes.length},${q(A)},${q(folder)},false from orders where company_id=${q(C)} and id=${q(x.order)} on conflict(id) do nothing;`);}
  }
  return {id:x.id,kind:x.kind,file,path,bucket:x.bucket,sha:digest,bytes:bytes.length,updates};
 }
 for(let i=0;i<selected.length;i+=8){const rs=(await Promise.all(selected.slice(i,i+8).map(one))).filter(Boolean);if(client&&rs.length)sql(`begin;${context}${rs.flatMap(x=>x.updates).join('\n')}delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;commit;`);log.completed.push(...rs.map(({updates,...x})=>x));save('pdf-'+mode,log);if(i%80===0||i+8>=selected.length)console.log(`PDF ${mode}: ${log.completed.length}/${selected.length}`);}
}
