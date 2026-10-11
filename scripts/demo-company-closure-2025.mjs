/** Rebuild ONLY explicitly synthetic 2025 sales. Original fiscal content stays. */
import {C,A,q,j,sql,guard,insert,read,save,has,uid,cents,sha,MARK} from './demo-company-closure.mjs';
export function allocate(weights,target){
 if(!Number.isSafeInteger(target)||target<0||!weights.length||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw Error('Invalid cent allocation');
 const sum=weights.reduce((s,w)=>s+w,0);if(!sum)throw Error('Empty allocation');
 const denominator=BigInt(sum),entries=weights.map((w,i)=>{const n=BigInt(w)*BigInt(target);return {i,value:Number(n/denominator),remainder:n%denominator};});
 let rest=target-entries.reduce((s,e)=>s+e.value,0);
 for(const e of [...entries].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)){if(!rest)break;e.value++;rest--;}
 return entries.map(e=>e.value);
}
export function build(s){
 const orders=s.orders.filter(o=>/^DEMO-2025-\d{3}$/.test(o.order_code)).sort((a,b)=>a.order_code.localeCompare(b.order_code));
 const docs=s.documenti_fiscali.filter(d=>/^DEMO55-\d{3}-[123]\/2025$/.test(d.numero));
 if(orders.length!==48||docs.length!==144)throw Error('Wrong original synthetic cohort');
 const other=s.documenti_fiscali.filter(d=>d.tipo==='fattura'&&d.data_emissione?.startsWith('2025-')&&!d.deleted_at&&!['bozza','annullata'].includes(d.stato)&&!docs.some(x=>x.id===d.id));
 const otherNet=other.reduce((n,d)=>n+cents(d.imponibile_totale),0),target=470000000-otherNet;
 const targets=allocate(orders.map(o=>cents(o.total_amount)),target),batches=[],manifest={company:C,target:4700000,otherNet:otherNet/100,orders:[],documents:[],quotes:[],sals:[],beforeSales:docs.reduce((n,d)=>n+cents(d.imponibile_totale),otherNet)/100};
 for(const [i,o]of orders.entries()){
  const ds=docs.filter(d=>d.ordine_id===o.id).sort((a,b)=>a.numero.localeCompare(b.numero));
  const quota=s.order_installments.filter(r=>r.order_id===o.id).sort((a,b)=>a.position-b.position);
  const quote=s.quotes.find(x=>x.id===o.quote_id),items=s.order_items.filter(x=>x.order_id===o.id).sort((a,b)=>a.position-b.position),quoteItems=s.quote_items.filter(x=>x.quote_id===quote?.id).sort((a,b)=>a.sort_order-b.sort_order);
  if(ds.length!==3||quota.length!==3||!quote||items.length!==6||quoteItems.length!==6||quote.signed_at||quote.signature_token||quote.sent_at||quote.firma_digitale_abilitata)throw Error('Incomplete or signed original cohort '+o.order_code);
  if(items.some(x=>x.quantity!==1||x.discount_percent)||quoteItems.some(x=>x.quantity!==1||x.discount_percent))throw Error('Nontrivial quantities/discounts need review');
  const targetNet=targets[i],parts=[Math.round(targetNet*30/100),Math.round(targetNet*40/100),0];parts[2]=targetNet-parts[0]-parts[1];
  const taxes=parts.map(n=>Math.round(n*Number(o.vat_rate)/100)),gross=parts.map((n,k)=>n+taxes[k]),totalGross=gross.reduce((n,x)=>n+x,0);
  const nextPrices=allocate(items.map(x=>cents(x.unit_price)),targetNet),statements=[];
  statements.push(`select id from orders where company_id=${q(C)} and id=${q(o.id)} and total_amount=${o.total_amount} for update;do $$begin if not exists(select 1 from orders where company_id=${q(C)} and id=${q(o.id)} and total_amount=${o.total_amount}) then raise exception 'Concurrent order change';end if;end $$;`);
  for(let part=0;part<3;part++){
   const old=ds[part],legacy=s.invoices.find(x=>x.id===old.id),rate=quota.find(x=>x.documento_fiscale_id===old.id&&x.invoice_id===old.id),dues=s.scadenze.filter(x=>x.invoice_id===old.id),lines=s.invoice_lines.filter(x=>x.invoice_id===old.id),movements=s.movimenti_cassa_native.filter(x=>x.documento_id===old.id),payments=s.invoice_payments.filter(x=>x.invoice_id===old.id),pns=s.prima_nota_entries.filter(x=>x.documento_fiscale_id===old.id||x.invoice_id===old.id);
   if(!legacy||!rate||dues.length!==1||lines.length!==1||old.trasmissione!=='manuale'||old.sdi_id_trasmissione||old.sdi_file_xml_url||old.sdi_firmato||old.deleted_at||legacy.external_provider||!old.note_documento?.includes('NON VALIDO AI FINI FISCALI')||!old.note_interne?.startsWith('[DEMO 5.5M 2025 v1]')||!['emessa','pagata'].includes(old.stato))throw Error('Protected/non-synthetic invoice '+old.id);
   const paid=cents(old.importo_pagato)>0;
   if(paid&&(movements.length!==1||payments.length!==1||pns.length!==1||cents(movements[0].importo)!==cents(old.totale_documento)||pns[0].auto_source!=='incasso_fattura'))throw Error('Complex payment needs review');
   if(!paid&&(movements.length||payments.length||pns.length))throw Error('Unexpected unpaid event');
   const id=uid('2025-invoice:'+old.id),number=old.numero.replace('DEMO55-','DEMO47-'),sc=dues[0],stamp=paid?movements[0].data_movimento+'T12:00:00Z':null;
   const note=MARK+' Documento dimostrativo sostitutivo di '+old.numero+'. NON FISCALE, mai trasmesso a SDI. Archivio originale conservato.';
   // Retain the same due ID before cancellation; otherwise native triggers
   // remove an unpaid old due and detach business relationships.
   statements.push(`update scadenze set notes=replace(coalesce(notes,''),${q('[DOC:'+old.id+']')},'') where company_id=${q(C)} and id=${q(sc.id)};`);
   statements.push(`update documenti_fiscali set stato='annullata',importo_pagato=0,pagato_at=null,note_interne=concat_ws(' ',note_interne,${q(MARK+' Sostituito SOLO nella simulazione da '+number+'. Originale archiviato, nessuno storno fiscale reale.')}) where company_id=${q(C)} and id=${q(old.id)} and imponibile_totale=${old.imponibile_totale} and totale_documento=${old.totale_documento} and stato=${q(old.stato)};update invoices set status='cancelled',paid_amount=0,payment_date=null,notes=concat_ws(' ',notes,${q(MARK+' Sostituito nella simulazione da '+number)}) where company_id=${q(C)} and id=${q(old.id)};`);
   // Historical manual seed, like the original cohort. No draft emission,
   // SDI endpoint, protection flag or disabled trigger is used.
   const d={...old,id,numero:number,numero_progressivo:60000+i*3+part,serie:'DEMO47',stato:'emessa',subtotale:parts[part]/100,imponibile_totale:parts[part]/100,iva_totale:taxes[part]/100,totale_documento:gross[part]/100,totale_da_pagare:gross[part]/100,importo_pagato:0,pagato_at:null,pdf_url:null,note_interne:note,documento_correlato_id:old.id,righe:[{...old.righe[0],prezzo_unitario:parts[part]/100,imponibile:parts[part]/100,iva:taxes[part]/100,totale:gross[part]/100}],riepilogo_iva:old.riepilogo_iva.map(r=>({...r,imponibile:parts[part]/100,imposta:taxes[part]/100})),scadenze_pagamento:old.scadenze_pagamento.map(r=>({...r,importo:gross[part]/100})),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};delete d.version;
   const l={...legacy,id,invoice_number:number,progressive_number:d.numero_progressivo,status:'draft',subtotal:parts[part]/100,tax_amount:taxes[part]/100,total:gross[part]/100,paid_amount:0,payment_date:null,pdf_url:null,pdf_generated_at:null,notes:note,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
   statements.push(insert('documenti_fiscali',d),insert('invoices',l),insert('invoice_lines',{...lines[0],id:uid('2025-invoice-line:'+lines[0].id),invoice_id:id,unit_price:parts[part]/100,line_net:parts[part]/100,line_tax:taxes[part]/100,line_gross:gross[part]/100}));
   // Discard only our transient, unpaid autogenerated due in this same
   // transaction; keep the original due ID and all its payment relationships.
   statements.push(`delete from scadenze where company_id=${q(C)} and auto_source='documento_fiscale' and notes=${q('[DOC:'+id+']')} and paid_amount=0 and invoice_id is null and created_at=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;`);
   statements.push(`update scadenze set invoice_id=${q(id)},amount=${gross[part]/100},paid_amount=${paid?gross[part]/100:0},paid_date=${q(sc.paid_date)},status=${q(paid?'pagata':'da_pagare')},description=${q('Fattura '+number+' - '+o.client_name)},notes=concat_ws(' ',notes,${q('[DOC:'+id+'] '+MARK)}) where company_id=${q(C)} and id=${q(sc.id)};`);
   for(const a of s.fattura_ordine.filter(a=>a.fattura_id===old.id))statements.push(`update fattura_ordine set fattura_id=${q(id)},importo_associato=${gross[part]/100},note=concat_ws(' ',note,${q(MARK)}) where company_id=${q(C)} and id=${q(a.id)} and fattura_id=${q(old.id)};`);
   // Re-use recorded events. Do not call registra_incasso or insert a payment.
   if(paid){
    const p=pns[0],bank=s.bank_transactions.find(b=>b.id===p.bank_transaction_id);
    statements.push(`update prima_nota_entries set invoice_id=${q(id)},documento_fiscale_id=${q(id)},amount=${gross[part]/100},description=replace(description,${q(old.numero)},${q(number)}),notes=concat_ws(' ',notes,${q(MARK+' Ricalcolo del medesimo incasso demo, non ulteriore pagamento.')}) where company_id=${q(C)} and id=${q(p.id)} and amount=${p.amount};`);
    if(bank){
     statements.push(`update bank_transactions set linked_invoice_id=${q(id)},reconciled_invoice_id=${q(id)},amount=${gross[part]/100},amount_eur=${gross[part]/100},description=replace(description,${q(old.numero)},${q(number)}),metadata=coalesce(metadata,'{}'::jsonb)||${j({documento_fiscale_id:id,replaces_demo_document:old.id})} where company_id=${q(C)} and id=${q(bank.id)} and amount=${bank.amount};`);
     statements.push(`update bank_reconciliations set invoice_id=${q(id)},matched_amount=${gross[part]/100},notes=concat_ws(' ',notes,${q(MARK)}) where company_id=${q(C)} and transaction_id=${q(bank.id)} and invoice_id=${q(old.id)} and unmatched_at is null;`);
    }else throw Error('Existing payment has no bank mirror');
    statements.push(`update movimenti_cassa_native set documento_id=${q(id)},importo=${gross[part]/100},note=concat_ws(' ',note,${q(MARK)}) where company_id=${q(C)} and id=${q(movements[0].id)} and importo=${movements[0].importo};`);
    statements.push(`update invoice_payments set invoice_id=${q(id)},amount=${gross[part]/100},notes=concat_ws(' ',notes,${q(MARK)}) where company_id=${q(C)} and id=${q(payments[0].id)} and amount=${payments[0].amount};`);
   }else statements.push(`update invoices set status='issued' where company_id=${q(C)} and id=${q(id)};`);
   statements.push(`update documenti_fiscali set stato=${q(paid?'pagata':'emessa')},importo_pagato=${paid?gross[part]/100:0},pagato_at=${q(stamp)} where company_id=${q(C)} and id=${q(id)};`);
   // New document is already paid before linking a previously paid installment:
   // allinea_fattura_da_rata must NOT manufacture a second collection.
   statements.push(`update order_installments set amount=${gross[part]/100},invoice_id=${q(id)},documento_fiscale_id=${q(id)} where id=${q(rate.id)} and order_id=${q(o.id)};`);
   statements.push(`do $$begin if(select count(*) from movimenti_cassa_native where company_id=${q(C)} and documento_id=${q(id)})<>${movements.length} or (select count(*) from prima_nota_entries where company_id=${q(C)} and documento_fiscale_id=${q(id)})<>${pns.length} or (select count(*) from scadenze where company_id=${q(C)} and invoice_id=${q(id)})<>1 then raise exception 'Duplicated fiscal cash/due';end if;if (select stato from documenti_fiscali where company_id=${q(C)} and id=${q(old.id)})<>'annullata' or (select status from invoices where company_id=${q(C)} and id=${q(old.id)})<>'cancelled' then raise exception 'Original remains active';end if;end $$;`);
   manifest.documents.push({id,original:old.id,number,order:o.id,net:parts[part]/100,vat:taxes[part]/100,gross:gross[part]/100,paid:paid?gross[part]/100:0,date:old.data_emissione,paymentDate:paid?movements[0].data_movimento:null,scad:sc.id});
  }
  for(const [k,item]of items.entries())statements.push(`update order_items set unit_price=${nextPrices[k]/100} where id=${q(item.id)} and order_id=${q(o.id)} and unit_price=${item.unit_price};`);
  const qp=allocate(quoteItems.map(x=>cents(x.unit_price)),targetNet);
  for(const [k,item]of quoteItems.entries())statements.push(`update quote_items set unit_price=${qp[k]/100} where company_id=${q(C)} and id=${q(item.id)} and quote_id=${q(quote.id)} and unit_price=${item.unit_price};`);
  const phases=quota.map((r,k)=>({label:r.label,amount:gross[k]/100}));
  const expires=new Date(new Date(quote.created_at).getTime()+Number(quote.validity_days||30)*86400000).toISOString();
  statements.push(`update quotes set subtotal=${targetNet/100},prezzo_manuale=${targetNet/100},vat_amount=${taxes.reduce((a,b)=>a+b,0)/100},total=${totalGross/100},payment_phases=${j(phases)},expires_at=${q(expires)},internal_notes=concat_ws(' ',internal_notes,${q(MARK+' Riallineato al capitolato demo 2025.')}) where company_id=${q(C)} and id=${q(quote.id)} and signed_at is null and signature_token is null;`);
  statements.push(`update orders set total_amount=${targetNet/100},internal_notes=concat_ws(' ',internal_notes,${q(MARK+' Ricalcolo storico demo; costi, quantità, squadre e tempi invariati.')}) where company_id=${q(C)} and id=${q(o.id)} and total_amount=${o.total_amount};`);
  for(const sal of s.sal_records.filter(x=>x.order_id===o.id)){
   const vs=s.sal_voci.filter(v=>v.sal_id===sal.id);if(vs.length!==1)throw Error('Complex SAL requires review');
   const net=Math.round(targetNet*Number(vs[0].percentuale_avanzamento)/100)/100;
   statements.push(`update sal_records set importo_totale=${net},note=concat_ws(' ',note,${q(MARK)}) where company_id=${q(C)} and id=${q(sal.id)};update sal_voci set importo_contrattuale=${targetNet/100} where id=${q(vs[0].id)} and sal_id=${q(sal.id)};`);
   manifest.sals.push({id:sal.id,order:o.id,net,percentage:vs[0].percentuale_avanzamento});
  }
  statements.push(`do $$begin if abs((select sum(imponibile_totale) from documenti_fiscali where company_id=${q(C)} and ordine_id=${q(o.id)} and tipo='fattura' and stato<>'annullata' and deleted_at is null)-${targetNet/100})>.001 or abs((select sum(amount) from order_installments where order_id=${q(o.id)})-${totalGross/100})>.001 or abs((select sum(quantity*unit_price) from order_items where order_id=${q(o.id)})-${targetNet/100})>.001 then raise exception 'Unbalanced reconstructed order';end if;end $$;`);
  manifest.orders.push({id:o.id,code:o.order_code,before:o.total_amount,net:targetNet/100,gross:totalGross/100});manifest.quotes.push({id:quote.id,order:o.id,net:targetNet/100,gross:totalGross/100});batches.push(statements);
 }
 if(cents(manifest.orders.reduce((n,o)=>n+o.net,0)+otherNet/100)!==470000000)throw Error('Annual cent allocation failed');
 return {company:C,marker:MARK,batches,manifest};
}
if(process.argv[1]?.endsWith('demo-company-closure-2025.mjs')){
 guard();if(!has('archive')||!has('cash-apply'))throw Error('Archive and cash closure required');if(has('sales-2025-apply'))throw Error('Preserve completed reconstruction');
 const s=read('company-before'),cash=read('cash-after');s.bank_transactions=cash.bank_transactions;s.bank_reconciliations=cash.bank_reconciliations;s.prima_nota_entries=cash.prima_nota_entries;s.scadenze=cash.scadenze;
 const p=build(s);save('sales-2025-plan',p);console.log({orders:p.manifest.orders.length,newDocuments:p.manifest.documents.length,quotes:p.manifest.quotes.length,sals:p.manifest.sals.length,batches:p.batches.length,target:p.manifest.target,otherSalesPreserved:p.manifest.otherNet});
}
