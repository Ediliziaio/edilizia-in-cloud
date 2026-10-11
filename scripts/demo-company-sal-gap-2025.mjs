/** Missing historical demo SALs. Existing prices, fiscal documents and cash never change. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {C,A,DIR,q,j,sql,guard,context,insert,uid,sha,read,save,has,serviceClient,queues} from './demo-company-closure.mjs';
import {read as finance,AS_OF} from './demo-company-accounting-audit.mjs';
import {render} from './demo-company-accounting-pdfs.mjs';
const STAGE='sal-gap-2025',MARK='[DEMO HISTORICAL SAL 2025 v1]',mode=process.argv[2]||'plan',money=x=>Number(x).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR',cents=x=>Math.round(Number(x)*100);
guard();
export function build(d){
 const jobs=d.orders.filter(o=>/^DEMO-2025-\d{3}$/.test(o.order_code)&&!d.sal_records.some(s=>s.order_id===o.id));
 if(jobs.length!==12)throw Error('Exactly the 12 missing historical SAL graphs required');
 const signatureSQL=`select md5(jsonb_build_object('documents',(select jsonb_agg(jsonb_build_array(id,stato,imponibile_totale,iva_totale,totale_documento,importo_pagato) order by id) from documenti_fiscali where company_id=${q(C)}),'costs',(select jsonb_agg(jsonb_build_array(id,amount,vat_rate,is_paid,paid_date) order by id) from company_costs where company_id=${q(C)}),'cash',(select jsonb_agg(jsonb_build_array(id,amount,entry_date,bank_transaction_id) order by id) from prima_nota_entries where company_id=${q(C)}))::text) value`;
 const signature=sql(signatureSQL)[0].value,batches=[],manifest={company:C,year:2025,marker:MARK,documents:[],newInvoices:0,newCash:0,newCosts:0};
 for(const o of jobs){
  const installments=d.order_installments.filter(i=>i.order_id===o.id).sort((a,b)=>a.position-b.position),fs=installments.map(i=>d.documenti_fiscali.find(f=>f.id===i.documento_fiscale_id&&f.ordine_id===o.id));
  if(installments.length!==3||fs.some(f=>!f||!f.numero.startsWith('DEMO47-')||!['pagata','emessa'].includes(f.stato)||!f.data_emissione.startsWith('2025-')||f.data_emissione>AS_OF)||fs.reduce((n,f)=>n+cents(f.imponibile_totale),0)!==cents(o.total_amount))throw Error('Protected, future or unbalanced source invoice');
  const s=[`do $$begin if exists(select 1 from sal_records where company_id=${q(C)} and order_id=${q(o.id)}) or not exists(select 1 from orders where company_id=${q(C)} and id=${q(o.id)} and order_code=${q(o.order_code)} and total_amount=${o.total_amount}) then raise exception 'Concurrent historical SAL/order change';end if;end $$;`];let cumulative=0;
  for(const [i,f]of fs.entries()){
   cumulative+=cents(f.imponibile_totale);const pct=Math.round(cumulative/cents(o.total_amount)*10000)/100,id=uid(STAGE+':'+f.id),sal={id,company_id:C,order_id:o.id,numero_sal:i+1,data_emissione:f.data_emissione,stato:'approvato',importo_totale:cumulative/100,created_by:A,installment_id:installments[i].id,note:MARK+' SAL fittizio cumulativo ricostruito dalle fatture DEMO già presenti. NON FISCALE, NON FIRMATO. Acconto già compensato; non crea fatture, pagamenti o costi.'};
   s.push(`do $$begin if not exists(select 1 from documenti_fiscali where company_id=${q(C)} and id=${q(f.id)} and imponibile_totale=${f.imponibile_totale} and stato=${q(f.stato)}) then raise exception 'SAL source invoice changed';end if;end $$;`,insert('sal_records',sal),insert('sal_voci',{id:uid(STAGE+'-row:'+f.id),sal_id:id,descrizione:'Capitolato DEMO '+o.order_code,importo_contrattuale:Number(o.total_amount),percentuale_avanzamento:pct,note:MARK}));
   manifest.documents.push({...sal,ref:o.order_code+' / SAL '+(i+1),client:o.client_name,net:Number(o.total_amount),percentage:pct,incrementNet:Number(f.imponibile_totale),invoice:f.id,invoiceNumber:f.numero});
  }
  s.push(`do $$begin if (${signatureSQL}) is distinct from ${q(signature)} then raise exception 'SAL backfill changed prices, costs or cash';end if;end $$;`);batches.push(s);
 }
 return {company:C,batches,manifest};
}
if(mode==='plan'){
 if(has(STAGE+'-apply'))throw Error('Applied SAL plan is immutable');const d=finance('latest');save(STAGE+'-before',d,true);const p=build(d);save(STAGE+'-plan',p);console.log({jobs:p.batches.length,sals:p.manifest.documents.length,newInvoices:0,newCash:0});
}else if(['preview','pdf-apply'].includes(mode)){
 if(!has(STAGE+'-apply')||read(STAGE+'-apply').completed.length!==12)throw Error('Complete saved SAL stage required');
 const p=read(STAGE+'-plan'),saved=sql(`select * from sal_records where company_id=${q(C)} and id in(${p.manifest.documents.map(x=>q(x.id))})`);
 if(saved.length!==36||saved.some(s=>s.note?.startsWith(MARK)!==true))throw Error('Saved SALs missing');
 if(sql("select public from storage.buckets where id='order-attachments'")[0]?.public!==false)throw Error('Private bucket required');
 const out=DIR+'/sal-gap-pdfs';mkdirSync(out,{recursive:true,mode:0o700});const selected=mode==='preview'?p.manifest.documents.slice(0,1):p.manifest.documents,client=mode==='pdf-apply'?await serviceClient():null,folder=uid('2025-documents-current');
 const key=STAGE+'-'+mode,log=has(key)?read(key):{company:C,total:selected.length,completed:[]};
 for(const x of selected){
  if(log.completed.some(v=>v.id===x.id))continue;const s=saved.find(s=>s.id===x.id);
  if(Number(s.importo_totale)!==x.importo_totale||s.data_emissione!==x.data_emissione)throw Error('Saved SAL amount/date changed');
  const bytes=await render({title:'SAL CUMULATIVO DEMO - NON FIRMATO',ref:x.ref,date:x.data_emissione,details:[['Cliente',x.client],['Data',s.data_emissione],['Contratto netto',money(x.net)],['Cumulativo netto',money(s.importo_totale)],['Incremento netto',money(x.incrementNet)],['Fattura già presente',x.invoiceNumber],['Pagamento','Acconto e incassi esistenti: nessun nuovo pagamento o addebito']],rows:[['Capitolato',x.percentage+'%']]});
  const digest=createHash('sha256').update(bytes).digest('hex'),file=out+'/sal-'+x.id+'.pdf';writeFileSync(file,bytes,{mode:0o600});const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});if(!text.includes('NON FISCALE')||text.includes('NaN')||text.includes('undefined')||!text.includes(x.ref))throw Error('Malformed SAL PDF');
  const path=`orders/${x.order_id}/demo-sal-backfill-2025/sal-${digest.slice(0,20)}.pdf`;
  if(client){const bucket=client.storage.from('order-attachments'),{error}=await bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false});if(error&&!/already exists|duplicate/i.test(error.message))throw Error('Private SAL upload failed');const {data,error:e}=await bucket.download(path);if(e||createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex')!==digest)throw Error('Uploaded SAL bytes differ');
   sql(`begin;${context}insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,folder_id,visible_to_customer) select ${q(uid(STAGE+'-attachment:'+x.id))},id,${q('DEMO - SAL CUMULATIVO - '+x.ref+'.pdf')},${q(path)},'application/pdf',${bytes.length},${q(A)},${q(folder)},false from orders where company_id=${q(C)} and id=${q(x.order_id)} on conflict(id) do nothing;${queues}commit;`);
  }
  log.completed.push({id:x.id,file,path,bytes:bytes.length,sha:digest});save(key,log);if(log.completed.length%12===0||log.completed.length===selected.length)console.log(`${mode} SAL ${log.completed.length}/${selected.length}`);
 }
}else throw Error('plan | preview | pdf-apply. Use closure runner for dry/apply sal-gap-2025.');
