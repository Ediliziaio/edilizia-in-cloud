/** Refresh only synthetic private purchase evidence; preserve old stored bytes. */
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {render} from './demo-company-accounting-pdfs.mjs';
import {C,A,DIR,MARK,AS_OF,q,j,sql,guard,context,uid,digest,read,save,has,cleanQueue} from './demo-company-procurement.mjs';
const money=x=>Number(x||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR';
export function documents(){
 const p=has('units-plan')?read('units-plan').plan:read('plan'),d=read('before'),out=[],v=new Map([...d.suppliers,...p.manifest.suppliers.map(x=>x.row)].map(x=>[x.id,x]));
 for(const f of p.manifest.receipts){
  const c=d.company_costs.find(c=>c.id===f.company_cost_id),order=d.orders.find(o=>o.id===f.order_id_suggerito),po=d.purchase_orders.find(o=>o.id===f.purchase_order_id);
  const grouped=p.manifest.receipts.filter(x=>x.company_cost_id===f.company_cost_id),partial=grouped.length>1;
  out.push({id:f.id,kind:'received',bucket:'documenti-smart',title:'FATTURA FORNITORE DEMO - NON FISCALE',ref:f.numero_fattura,date:f.data_fattura,order:order?.id,oldPath:f.pdf_storage_path,details:[['Fornitore simulato',f.cedente_ragione_sociale],['Data documento',f.data_fattura],['Commessa',order?.order_code||'Struttura aziendale'],['Ordine di acquisto',po?.oda_number||'Spesa corrente senza ODA'],['Imponibile',money(f.imponibile_totale)],['IVA',money(f.iva_totale)],['Totale',money(f.totale_documento)],['Pagamento',c?.is_paid?'Saldo cumulativo già registrato - '+c.paid_date:'Impegno aperto; nessun nuovo pagamento'],['Riferimento contabile',c?.name||'Costo non disponibile'],['Fatture della stessa spesa',partial?grouped.length+' documenti; cumulativo '+money(c.amount)+' imponibile':'Una sola fattura'],['Nota',partial?'Questa fattura è una quota del costo già contabilizzato. Non sommare il costo padre e le sue fatture.':'Dettaglio dei dati demo esistenti; nessun costo aggiuntivo']],rows:(f.righe||[]).map(r=>[`${r.descrizione}\n${r.quantita} ${r.unita_misura||'pz'} x ${Number(r.prezzo_unitario).toLocaleString('it-IT',{maximumFractionDigits:6})} EUR${r.lotto?' - lotto '+r.lotto:''}`,money(r.totale_riga)])});
 }
 for(const x of p.manifest.ddts){
  const po=d.purchase_orders.find(y=>y.id===x.po),order=d.orders.find(y=>y.id===x.order),old=d.ddt_ricezione.find(y=>y.id===x.id);
  out.push({id:x.id,kind:'ddt',bucket:'ddt_attachments',title:'DDT E PACKING LIST DEMO - NON FISCALE',ref:x.number,date:x.date,order:x.order,oldPath:old.ddt_file_url,details:[['Fornitore simulato',v.get(x.supplier)?.name],['Data consegna già registrata',x.date],['Commessa',order?.order_code],['ODA',po.oda_number],['Ricezione',x.physical.length+' prodotti fisici; '+p.manifest.goods.filter(g=>g.ddt_ricezione_id===x.id).length+' capitoli ODA collegati'],['Verifica', 'Simulata; senza firma elettronica o firma cliente'],['Lettura quantità','Sacchi, scatole e pezzi hanno unità diverse: non sono sommati tra loro.'],['Tracciabilità', 'Il carico era già presente. Questa bolla documenta quei lotti, non registra un nuovo acquisto.'],['Riconciliazione utilizzi','Utilizzi e rimanenze ricostruiti al '+AS_OF+' nel magazzino e nei rapportini']],rows:x.physical.map(r=>[`${r.descrizione}\nLotto ${r.lotto}\nRicevuti ${r.quantita} ${r.unita_misura} - utilizzati ${r.utilizzata} - rimasti ${r.rimanenza}`,money(r.quantita*r.prezzo_unitario)])});
  for(const small of x.small){const f=p.manifest.receipts.find(y=>y.id===small.invoice);out.push({id:small.invoice,ddtId:x.id,kind:'bolla',bucket:'ddt_attachments',title:'PICCOLA BOLLA DI FORNITURA DEMO - NON FISCALE',ref:'BOLLA-'+f.numero_fattura,date:x.date,order:x.order,details:[['Fornitore simulato',f.cedente_ragione_sociale],['Data ricezione',x.date],['ODA',po.oda_number],['Commessa',order?.order_code],['Fattura collegata',f.numero_fattura],['Bolla complessiva di riferimento',x.number],['Avvertenza','Frazione documentale della consegna già registrata: nessun secondo carico di magazzino o costo.']],rows:small.lines.map(r=>[`${r.descrizione}\n${r.quantita} ${r.unita_misura} - lotto ${r.lotto}`,money(r.quantita*r.prezzo_unitario)])});}
 }
 return out;
}
if(process.argv[1]?.endsWith('demo-company-procurement-pdfs.mjs')){
 guard();const mode=process.argv[2]||'count',all=documents();if(mode==='count'){console.log(JSON.stringify({total:all.length,byKind:all.reduce((a,x)=>{a[x.kind]=(a[x.kind]||0)+1;return a},{})}));process.exit(0);}
 if(!['preview','apply'].includes(mode))throw Error('Unknown mode');
 if(mode==='apply'&&(!has('apply')||read('apply').completed.length!==read('plan').batches.length))throw Error('Complete data application before PDF publication');
 if(mode==='apply'&&has('units-plan')&&(!has('units-apply')||read('units-apply').completed.length!==read('units-plan').batches.length))throw Error('Complete packaging-unit verification before PDF publication');
 const selected=mode==='preview'?[all.find(x=>x.kind==='received'&&x.ref.startsWith('DEMO-PIC')),all.find(x=>x.kind==='ddt'),all.find(x=>x.kind==='bolla')]:all,out=DIR+'/pdfs';mkdirSync(out,{recursive:true,mode:0o700});
 const logName='pdf-'+mode+(mode==='preview'&&has('units-plan')?'-units':''),hash=digest(all),log=has(logName)?read(logName):{company:C,hash,expected:selected.length,completed:[]};if(log.hash!==hash)throw Error('PDF plan changed');
 let client,attachments=[];const folder=uid('purchase-folder');
 if(mode==='apply'){
  const bs=sql("select id,public from storage.buckets where id in('documenti-smart','ddt_attachments','order-attachments')");if(bs.length!==3||bs.some(x=>x.public))throw Error('Private buckets required');
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Storage authorization unavailable');
  client=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(25000)})}});
  attachments=sql(`select a.id,a.order_id,a.file_url from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)}`);
  sql(`begin;${context}insert into order_document_folders(id,company_id,nome,posizione,visibile_cliente,created_by) values(${q(folder)},${q(C)},'Acquisti e bolle - DEMO dettagliata',22,false,${q(A)}) on conflict(id) do nothing;commit;`);
 }
 async function upload(bucket,path,bytes){if(!path.startsWith(C+'/')&&!path.startsWith('orders/'))throw Error('Unsafe storage scope');const {error}=await client.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Private upload failed');const r=await client.storage.from(bucket).download(path);if(r.error||digest(new Uint8Array(await r.data.arrayBuffer()))!==digest(bytes))throw Error('Stored bytes differ');const s=await client.storage.from(bucket).createSignedUrl(path,31536000);if(s.error)throw Error('Unable to sign private path');return s.data.signedUrl;}
 async function one(x){
  if(log.completed.some(c=>c.id===x.id&&c.kind===x.kind))return null;
  const bytes=await render(x),sha=digest(bytes),file=`${out}/${x.kind}-${x.id}.pdf`;writeFileSync(file,bytes,{mode:0o600});const content=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!content.includes('NON FISCALE')||content.includes('NaN')||content.includes('undefined')||!content.includes(x.ref.slice(0,25)))throw Error('PDF failed validation');
  const path=`${C}/${x.id}/demo-detail-${x.kind}-${sha.slice(0,20)}.pdf`,updates=[];
  if(client){const url=await upload(x.bucket,path,bytes);if(x.kind==='received')updates.push(`update fatture_ricevute set pdf_storage_bucket=${q(x.bucket)},pdf_storage_path=${q(path)},pdf_url=${q(url)} where company_id=${q(C)} and id=${q(x.id)} and xml_raw is null and note like ${q('%'+MARK+'%')};`);
   else if(x.kind==='ddt')updates.push(`update ddt_ricezione set ddt_file_url=${q(url)},ddt_file_name=${q('DEMO - '+x.ref+'.pdf')},ddt_file_mime='application/pdf' where company_id=${q(C)} and id=${q(x.id)};`);
   else{const value={url,name:'DEMO - '+x.ref+'.pdf',mime:'application/pdf',size:bytes.length,uploaded_at:AS_OF+'T12:00:00Z',kind:'bolla',path};updates.push(`update ddt_ricezione set attachments=coalesce(attachments,'[]'::jsonb)||${j([value])} where company_id=${q(C)} and id=${q(x.ddtId)} and not exists(select 1 from jsonb_array_elements(coalesce(attachments,'[]'::jsonb)) e where e->>'path'=${q(path)});`);}
   if(x.order){const ap=`orders/${x.order}/demo-procurement/${x.kind}-${sha.slice(0,20)}.pdf`;await upload('order-attachments',ap,bytes);
    const oldHash=x.oldPath?.match(/([a-f0-9]{20})\.pdf/)?.[1],old=oldHash?attachments.filter(a=>a.order_id===x.order&&a.file_url.includes(oldHash)):[];
    if(old.length)for(const a of old)updates.push(`update order_attachments set file_url=${q(ap)},file_name=${q('DEMO - '+x.ref+'.pdf')},file_size=${bytes.length},folder_id=${q(folder)},visible_to_customer=false where id=${q(a.id)} and order_id=${q(x.order)} and exists(select 1 from orders where id=order_id and company_id=${q(C)});`);
    else updates.push(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) select ${q(uid('attachment:'+x.kind+':'+x.id))},id,${q('DEMO - '+x.ref+'.pdf')},${q(ap)},'application/pdf',${bytes.length},${q(A)},${q(folder)},false from orders where company_id=${q(C)} and id=${q(x.order)} on conflict(id) do nothing;`);
   }
  }
  return {id:x.id,kind:x.kind,file,bucket:x.bucket,path,sha,bytes:bytes.length,updates};
 }
 for(let i=0;i<selected.length;i+=8){const rows=(await Promise.all(selected.slice(i,i+8).map(one))).filter(Boolean);if(client&&rows.length)sql(`begin;${context}${rows.flatMap(x=>x.updates).join('\n')}${cleanQueue()}commit;`);log.completed.push(...rows.map(({updates,...x})=>x));save(logName,log);if(i%80===0||i+8>=selected.length)console.log(`PDF ${mode}: ${log.completed.length}/${selected.length}`);}
}
