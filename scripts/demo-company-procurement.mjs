/** DEMO-only detail of existing purchases. Money and physical movements stay unchanged. */
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {C,A,q,j,sql,guard,context,insert,read as accountingRead} from './demo-company-accounting-audit.mjs';
export {C,A,q,j,sql,guard,context,insert};
export const DIR='tmp/demo-integrated/procurement-2026-10-10',MARK='[DEMO PROCUREMENT DETAIL v1]',AS_OF='2026-10-10';
mkdirSync(DIR,{recursive:true,mode:0o700});
export const has=n=>existsSync(`${DIR}/${n}.json.gz`);
export const read=n=>JSON.parse(gunzipSync(readFileSync(`${DIR}/${n}.json.gz`)));
export const save=(n,v,immutable=false)=>{if(immutable&&has(n))throw Error('Preserve '+n);writeFileSync(`${DIR}/${n}.json.gz`,gzipSync(JSON.stringify(v)),{mode:0o600});};
export const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const uid=k=>{const h=digest(MARK+'|'+k);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const cents=x=>Math.round(Number(x||0)*100),round=x=>cents(x)/100;
export function fiscalLines(lines,net,vat,rate=22){
 const out=lines.map(r=>({...r,aliquota_iva:String(rate),imponibile:round(r.quantita*r.prezzo_unitario)}));
 const delta=cents(net)-out.reduce((n,r)=>n+cents(r.imponibile),0);
 if(Math.abs(delta)>10)throw Error('Physical quantities do not cover invoice: '+delta);
 if(delta)out.push({descrizione:'Arrotondamento prezzi unitari di lotto (DEMO)',quantita:1,unita_misura:'corpo',prezzo_unitario:delta/100,imponibile:delta/100,aliquota_iva:String(rate)});
 let allocated=0;for(const [i,r]of out.entries()){r.imposta=i===out.length-1?(cents(vat)-allocated)/100:round(r.imponibile*rate/100);allocated+=cents(r.imposta);r.totale_riga=(cents(r.imponibile)+cents(r.imposta))/100;}
 if(out.some(r=>!Number.isFinite(r.prezzo_unitario)||r.quantita<=0)||out.reduce((n,r)=>n+cents(r.totale_riga),0)!==cents(net)+cents(vat))throw Error('Invalid invoice lines');
 return out;
}
const vendorDefs=[
 ['mobile','Mobile e Fibra DEMO S.r.l.','Telefonia e connettività','Elena Demo'],
 ['energia','Energia e Acqua DEMO S.r.l.','Energia, gas e acqua','Paolo Demo'],
 ['ufficio','Office Point DEMO S.r.l.','Carta, toner e cancelleria','Laura Demo'],
 ['software','Software Progetti DEMO S.r.l.','Licenze CAD e software','Marco Demo'],
 ['pulizie','Pulizie e Vigilanza DEMO S.r.l.','Pulizie e servizi','Anna Demo'],
 ['amministrazione','Studio Contabile DEMO','Consulenza amministrativa','Roberto Demo'],
 ['paghe','Studio Paghe DEMO','Consulenza del lavoro','Giulia Demo'],
 ['immobili','Immobiliare Sedi DEMO S.r.l.','Ufficio e magazzino','Carlo Demo'],
 ['marketing','Comunicazione DEMO S.r.l.','Marketing','Sara Demo'],
 ['flotta','Leasing Flotta DEMO S.r.l.','Leasing e manutenzione','Luca Demo'],
 ['tecnomat','Tecnomat - simulazione DEMO (non affiliata)','Cementi, malte e piccoli acquisti','Referente banco DEMO'],
 ['ferramenta','Ferramenta di Cantiere DEMO S.r.l.','Minuteria e utensili','Davide Demo'],
 ['edilizia','Edilmarket DEMO S.r.l.','Forniture edili','Andrea Demo'],
 ['dpi','Sicurezza e DPI DEMO S.r.l.','DPI e consumabili','Marta Demo'],
 ['noleggi','Noleggi e Trasporti DEMO S.r.l.','Mezzi, attrezzature e consegne','Fabio Demo'],
 ['rifiuti','Recuperi Edili DEMO S.r.l.','Trasporto e smaltimento','Silvia Demo'],
];
export function vendors(){return vendorDefs.map(([key,name,category,person],i)=>({key,person,row:{id:uid('supplier:'+key),company_id:C,name,email:`${key}@fornitori-demo.invalid`,address:`Via della Simulazione ${i+1}`,city:'Milano',province:'MI',postal_code:'20100',country:'Italia',product_category:category,vat_rate:22,is_active:true,payment_method:'bonifico_30gg',lead_time_days:['edilizia','tecnomat','ferramenta','dpi'].includes(key)?2:0,notes:`${MARK} Identità e recapiti fittizi. Referente: ${person}; contatto CRM ${uid('contact:'+key)}. Nessun invio reale; nessuna P.IVA o firma inventata.`,created_at:'2023-01-01T08:00:00Z'}}));}
function safeReceipt(f){return !!f&&!f.xml_raw&&!f.xml_url&&!f.sdi_id_trasmissione&&!f.openapi_id&&/DEMO/i.test(f.note||'')&&f.data_fattura<=AS_OF;}
function costVendor(c){if(/DPI/.test(c.name))return 'dpi';const k=c.category?.toLowerCase();return ({telefonia:'mobile',utenze:'energia',cancelleria:'ufficio',software:'software',struttura_servizi:'pulizie',servizi:'pulizie',commercialista:'amministrazione',professionisti:'amministrazione',consulenza_lavoro:'paghe',affitti:'immobili',immobili:'immobili',marketing:'marketing',pubblicita:'marketing',leasing:'flotta',veicoli:'flotta',manutenzione:'flotta',rifiuti:'rifiuti'})[k];}
export function serviceRows(c,net=c.amount,part=0){
 const k=c.category.toLowerCase(),month=c.due_date.slice(0,7),n=Number(net),qty=k==='telefonia'?(month.startsWith('2023')?8:12):1;
 const row=(descrizione,quantita,prezzo_unitario,unita_misura='servizio')=>({descrizione:`DEMO - ${descrizione} - competenza ${month}`,quantita,prezzo_unitario,unita_misura});
 if(k==='telefonia'){
  const perSim=round(n*.55/qty),fiber=round(n*.3);return [row('Canoni SIM aziendali (numeri non attivi)',qty,perSim,'SIM/mese'),row('Fibra ufficio',1,fiber,'mese'),row('Centralino VoIP e assistenza',1,round(n-qty*perSim-fiber),'mese')];
 }
 if(k==='utenze'){const a=round(n*.62),b=round(n*.27);return [row('Energia elettrica ufficio e magazzino',1,a,'mese'),row('Gas e riscaldamento',1,b,'mese'),row('Acqua e oneri di servizio',1,round(n-a-b),'mese')];}
 if(k==='cancelleria'){
  if(part===0){const a=30;return [row('Carta A4 80g - risma 500 fogli',5,a/5,'risme'),row('Toner compatibile ufficio',1,round(n-a),'pz')];}
  if(part===1){const a=round(n*.4);return [row('Guanti monouso e detergenti per ufficio',4,a/4,'confezioni'),row('Carta e salviette ufficio',3,round(n-a)/3,'confezioni')];}
  const a=round(n*.45);return [row('Cartelline e raccoglitori documenti',5,a/5,'pz'),row('Etichette, penne e consumabili stampante',1,round(n-a),'kit')];
 }
 const names={software:['Licenze CAD e progettazione','Gestionale e backup'],struttura_servizi:['Pulizie ufficio e spazi comuni','Vigilanza e servizi'],servizi:['Pulizie ufficio','Materiali e servizi igienici'],commercialista:['Tenuta contabilità e liquidazioni','Consulenza amministrativa'],professionisti:['Servizio contabile mensile','Assistenza amministrativa'],consulenza_lavoro:['Elaborazione cedolini','Adempimenti personale'],affitti:['Canone ufficio','Canone magazzino'],immobili:['Canone magazzino','Spazi showroom'],marketing:['Campagne acquisizione contatti','Produzione contenuti'],pubblicita:['Campagne pubblicitarie','Creatività e gestione'],leasing:['Canone leasing flotta','Servizi inclusi'],veicoli:['Canone furgone','Servizi flotta'],manutenzione:['Manodopera manutenzione','Ricambi e materiali'],rifiuti:['Trasporto rifiuti di cantiere','Conferimento e trattamento']};
 const labels=/DPI/.test(c.name)?['DPI personali per squadra','Consumabili e protezioni di cantiere']:names[k];if(!labels)throw Error('Missing service detail '+k);const a=round(n*.7);return [row(labels[0],1,a),row(labels[1],1,round(n-a))];
}
export function financialSignature(d){
 const keys={company_costs:['id','amount','vat_rate','is_paid','paid_date','due_date','order_id','purchase_order_id','allocations'],prima_nota_entries:['id','amount','entry_date','direction','bank_transaction_id','cost_id'],bank_transactions:['id','amount','booking_date','account_id'],bank_accounts:['id','opening_balance','current_balance'],scadenze:['id','amount','paid_amount','paid_date','due_date','status'],purchase_orders:['id','subtotal','vat_total','total','status'],v_ordine_marginalita:['id','consuntivo','imponibile'],documenti_fiscali:['id','numero','data_emissione','imponibile_totale','iva_totale','totale_documento','importo_pagato','righe','stato'],invoices:['id','total','tax_amount','paid_amount','status','issue_date']};
 return Object.fromEntries(Object.entries(keys).map(([t,fields])=>[t,digest((d[t]||[]).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))).sort((a,b)=>a.id.localeCompare(b.id)))]));
}
export function build(d,p){
 const manifest={company:C,years:[2023,2025,2026],suppliers:vendors(),receipts:[],newReceipts:[],goods:[],ddts:[],physical:[],deferred:[]},batches=[];
 const vs=new Map(manifest.suppliers.map(x=>[x.key,x.row])),fs=new Map(),newCounts={};
 function updateReceipt(f,patch){if(!safeReceipt(f))throw Error('Protected received document '+f?.id);const next={...f,...patch};fs.set(next.id,next);const set=Object.entries(patch).map(([k,v])=>`${k}=${v&&typeof v==='object'?j(v):q(v)}`).join(',');return `update fatture_ricevute set ${set} where company_id=${q(C)} and id=${q(f.id)} and xml_raw is null and sdi_id_trasmissione is null and imponibile_totale=${q(f.imponibile_totale)};`;}
 function newReceipt(base,net,vat,lines,key,date){const f={id:uid('receipt:'+key),company_id:C,numero_fattura:`DEMO-PIC-${date.slice(0,4)}-${digest(key).slice(0,10)}`,data_fattura:date,cedente_ragione_sociale:base.cedente_ragione_sociale,cedente_paese:'IT',tipo_documento:'TD01',imponibile_totale:net,iva_totale:vat,totale_documento:round(net+vat),righe:lines,riepilogo_iva:[{aliquota_iva:'22',imponibile:net,imposta:vat}],company_cost_id:base.company_cost_id,purchase_order_id:base.purchase_order_id,order_id_suggerito:base.order_id_suggerito,prima_nota_id:base.prima_nota_id,aggancio_oda_manuale:true,stato:'contabilizzata',note:`${MARK} NON FISCALE. Quota della spesa aggregata ${base.company_cost_id}; saldo cumulativo nella prima nota esistente. Non un nuovo costo, pagamento o carico. Documento originario ${base.numero_fattura}.`};fs.set(f.id,f);manifest.newReceipts.push(f.id);return f;}
 for(const c of d.company_costs){
  const key=costVendor(c);if(!key)continue;const ff=d.fatture_ricevute.filter(f=>f.company_cost_id===c.id);
  if(ff.length!==1||!safeReceipt(ff[0])||c.purchase_order_id)continue;
  const f=ff[0],v=vs.get(key),s=[],patch={cedente_ragione_sociale:v.name,cedente_indirizzo:v.address,cedente_comune:v.city,cedente_cap:v.postal_code,cedente_provincia:v.province,note:(f.note||'')+' '+MARK+' Dettaglio manuale sintetico; totali e pagamento aggregato invariati.'};
  if(c.category.toLowerCase()==='cancelleria'&&[210,300].includes(Number(c.amount))&&Number(c.vat_rate)===22){
   const part=round(c.amount/3),vat=round(part*.22);patch.imponibile_totale=part;patch.iva_totale=vat;patch.totale_documento=round(part+vat);patch.righe=fiscalLines(serviceRows(c,part,0),part,vat);patch.riepilogo_iva=[{aliquota_iva:'22',imponibile:part,imposta:vat}];
   for(const n of [1,2]){const date=c.due_date.slice(0,8)+(n===1?'07':'21'),extra=newReceipt({...f,cedente_ragione_sociale:v.name},part,vat,fiscalLines(serviceRows(c,part,n),part,vat),'office:'+c.id+':'+n,date);s.push(insert('fatture_ricevute',extra));}
  }else{patch.righe=fiscalLines(serviceRows(c),f.imponibile_totale,f.iva_totale,Number(c.vat_rate));patch.riepilogo_iva=[{aliquota_iva:String(c.vat_rate),imponibile:f.imponibile_totale,imposta:f.iva_totale}];}
  s.push(updateReceipt(f,patch));s.push(`update company_costs set supplier_id=${q(v.id)} where company_id=${q(C)} and id=${q(c.id)} and amount=${q(c.amount)};update scadenze set supplier_id=${q(v.id)} where company_id=${q(C)} and cost_id=${q(c.id)};update prima_nota_entries set supplier_id=${q(v.id)} where company_id=${q(C)} and cost_id=${q(c.id)};`);batches.push(s);
 }
 for(const po of d.purchase_orders.filter(x=>/^ODA-DEMO-202[356]/.test(x.oda_number)).sort((a,b)=>a.oda_number.localeCompare(b.oda_number))){
  const items=d.purchase_order_items.filter(i=>i.purchase_order_id===po.id),ids=new Set(items.map(i=>i.order_item_id));
  // Returned unused packs are NOT another supplier delivery or invoice.
  const incoming=p.warehouse_movements.filter(m=>m.movement_type==='carico'&&ids.has(m.order_item_id)&&!/reso materiale/i.test(m.notes||''));
  const ff=d.fatture_ricevute.filter(f=>f.purchase_order_id===po.id),ddts=d.ddt_ricezione.filter(x=>x.purchase_order_id===po.id);
  if(incoming.length!==24||ff.length!==1||ddts.length!==1||po.status!=='ricevuto'||!safeReceipt(ff[0])){manifest.deferred.push({po:po.id,number:po.oda_number,reason:'No unique complete physical delivery and safe demo invoice'});continue;}
  if(Math.abs(incoming.reduce((n,m)=>n+m.quantity*m.unit_cost,0)-po.subtotal)>.1)throw Error('Warehouse purchase differs from PO '+po.id);
  const f=ff[0],ddt=ddts[0],year=Number(f.data_fattura.slice(0,4)),s=[],physical=[];let supplier=po.supplier_id,cedente=f.cedente_ragione_sociale;
  const rows=incoming.map(m=>{const stock=p.warehouse_stock.find(x=>x.id===m.stock_item_id);if(!stock)throw Error('Cross-tenant stock');const outs=p.warehouse_movements.filter(x=>x.stock_item_id===m.stock_item_id&&x.order_item_id===m.order_item_id&&x.lot_number===m.lot_number&&x.created_at.slice(0,10)<=AS_OF);const used=outs.reduce((n,x)=>n+(x.movement_type==='scarico'?x.quantity:/reso materiale/i.test(x.notes||'')?-x.quantity:0),0);if(used<0||used>m.quantity)throw Error('Invalid lot use');const r={descrizione:stock.name,quantita:m.quantity,unita_misura:/sacco|Cemento|Malta|Rasante|Collante/i.test(stock.name)?'sacchi':/scatola/i.test(stock.name)?'scatole':/bobina/i.test(stock.name)?'bobine':/rotolo|Nastro giunti/i.test(stock.name)?'rotoli':'pz',prezzo_unitario:Number(m.unit_cost),stock_item_id:stock.id,order_item_id:m.order_item_id,lotto:m.lot_number,movimento_carico_id:m.id};physical.push({...r,utilizzata:used,rimanenza:m.quantity-used});return r;});
  let net=f.imponibile_totale,vat=f.iva_totale;const small=[];
  const cement=rows.find(r=>/Cemento 32\.5/.test(r.descrizione)),mortar=rows.find(r=>/Malta premiscelata/.test(r.descrizione));
  if([2023,2025,2026].includes(year)&&(newCounts[year]||0)<6&&cement?.quantita>=20&&mortar?.quantita>=10&&cement.prezzo_unitario===7.5&&mortar.prezzo_unitario===8.9){
   const detail=[{...cement,quantita:20},{...mortar,quantita:10}],amount=239,tax=52.58;cement.quantita-=20;mortar.quantita-=10;net=round(net-amount);vat=round(vat-tax);
   const vendor=vs.get(['tecnomat','ferramenta','edilizia'][(newCounts[year]||0)%3]);supplier=vendor.id;cedente=vendor.name;
   s.push(`update purchase_orders set supplier_id=${q(supplier)} where company_id=${q(C)} and id=${q(po.id)} and supplier_id=${q(po.supplier_id)};update company_costs set supplier_id=${q(supplier)} where company_id=${q(C)} and purchase_order_id=${q(po.id)};update scadenze set supplier_id=${q(supplier)} where company_id=${q(C)} and cost_id=${q(f.company_cost_id)};update prima_nota_entries set supplier_id=${q(supplier)} where company_id=${q(C)} and cost_id=${q(f.company_cost_id)};`);
   const extra=newReceipt({...f,cedente_ragione_sociale:cedente},amount,tax,fiscalLines(detail,amount,tax),'cement:'+po.id,f.data_fattura);extra.note+=' Lotti già compresi nella bolla: nessun secondo carico.';s.push(insert('fatture_ricevute',extra));small.push({invoice:extra.id,lines:detail});newCounts[year]=(newCounts[year]||0)+1;
  }
  s.push(updateReceipt(f,{cedente_ragione_sociale:cedente,imponibile_totale:net,iva_totale:vat,totale_documento:round(net+vat),righe:fiscalLines(rows.filter(r=>r.quantita>0),net,vat),riepilogo_iva:[{aliquota_iva:'22',imponibile:net,imposta:vat}],note:(f.note||'')+' '+MARK+' Dettaglio dei lotti già movimentati. Fatture parziali dello stesso ODA/costo, totale cumulativo invariato.'}));
  // Backfill the documentary receipt of ALREADY loaded material. Insert pending,
  // then validate it: the INSERT-only stock loader must not load it a second time.
  for(const item of items){const id=uid('goods:'+ddt.id+':'+item.id),g={id,company_id:C,order_item_id:item.order_item_id,supplier_id:supplier,ddt_ricezione_id:ddt.id,warehouse_id:ddt.warehouse_id,receipt_date:ddt.data_ricezione+'T07:00:00',quantity_received:Number(item.quantity_received||item.quantity),ddt_number:ddt.numero_ddt,received_by:A,quality_check_status:'pending',notes:`${MARK} Ricostruzione documentale del capitolo già ricevuto. Confezioni e lotti nel PDF; carichi fisici preesistenti. Nessun carico automatico duplicato.`,created_at:ddt.data_ricezione+'T07:00:00'};if(!Number.isInteger(g.quantity_received)||g.quantity_received<=0)throw Error('Invalid chapter quantity');s.push(insert('goods_receipts',g),`update goods_receipts set quality_check_status='ok' where company_id=${q(C)} and id=${q(id)} and quality_check_status='pending';`);manifest.goods.push({...g,quality_check_status:'ok'});}
  const note=(ddt.note||'')+' '+MARK+' Ricezione per capitoli ODA; confezioni e lotti dettagliati nel packing list. Resi al magazzino esclusi dagli acquisti. Nessuna seconda movimentazione.';
  s.push(`update ddt_ricezione set note=${q(note)} where company_id=${q(C)} and id=${q(ddt.id)};`);batches.push(s);
  manifest.ddts.push({id:ddt.id,number:ddt.numero_ddt,date:ddt.data_ricezione,po:po.id,order:po.order_id,supplier,physical,small});manifest.physical.push(...physical);
 }
 manifest.receipts=[...fs.values()];return {company:C,manifest,batches};
}
export function invariantSQL(d,p){
 const n=t=>(d[t]||[]).length;
 return `do $$begin if (select count(*) from company_costs where company_id=${q(C)})<>${n('company_costs')} or (select sum(amount) from company_costs where company_id=${q(C)})<>${d.company_costs.reduce((s,x)=>s+cents(x.amount),0)/100} or (select count(*) from bank_transactions where company_id=${q(C)})<>${n('bank_transactions')} or (select count(*) from prima_nota_entries where company_id=${q(C)})<>${n('prima_nota_entries')} or (select sum(imponibile_totale) from fatture_ricevute where company_id=${q(C)})<>${d.fatture_ricevute.reduce((s,x)=>s+cents(x.imponibile_totale),0)/100} or (select sum(iva_totale) from fatture_ricevute where company_id=${q(C)})<>${d.fatture_ricevute.reduce((s,x)=>s+cents(x.iva_totale),0)/100} or (select count(*) from warehouse_movements where company_id=${q(C)})<>${p.warehouse_movements.length} or (select count(*) from warehouse_stock where company_id=${q(C)})<>${p.warehouse_stock.length} then raise exception 'Backfill changed money or added stock movement';end if;end $$;`;
}
export function cleanQueue(){return `delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;`;}
if(process.argv[1]?.endsWith('demo-company-procurement.mjs')){
 const mode=process.argv[2]||'plan';guard();
 if(mode==='plan'){
  if(has('apply'))throw Error('Preserve applied plan');if(!has('before'))save('before',accountingRead('latest'),true);if(!has('physical-before'))save('physical-before',accountingRead('small-purchase-physical'),true);
  const p=build(read('before'),read('physical-before'));save('plan',p);console.log(JSON.stringify({suppliers:p.manifest.suppliers.length,receipts:p.manifest.receipts.length,newReceipts:p.manifest.newReceipts.length,goods:p.manifest.goods.length,ddts:p.manifest.ddts.length,deferred:p.manifest.deferred.length,batches:p.batches.length}));
 }else if(['dry','apply'].includes(mode)){
  const p=read('plan'),hash=digest(p);if(mode==='apply'&&(!has('dry')||read('dry').hash!==hash||p.batches.some((_,i)=>!read('dry').completed.includes(i))))throw Error('Complete rollback rehearsal required');
  const log=has(mode)?read(mode):{company:C,hash,completed:[]};if(log.hash!==hash)throw Error('Changed plan');
  const deps=p.manifest.suppliers.flatMap(({key,person,row})=>[insert('suppliers',row),insert('marketing_contacts',{id:uid('contact:'+key),company_id:C,first_name:person,last_name:'Fornitore DEMO',company_name:row.name,email:row.email,contact_type:'supplier',notes:`${MARK} supplier_id=${row.id}. Contatto fittizio.`,source:'manual',optout_email:true,optout_whatsapp:true,optout_sms:true,optout_call:true,opt_out:true,unsubscribed:true,marketing_consent:false,created_by:A,created_at:'2023-01-01T08:00:00Z'}),`update marketing_contacts set tags=array['DEMO','fornitore'] where company_id=${q(C)} and id=${q(uid('contact:'+key))};`]).join('\n');
  const check=invariantSQL(read('before'),read('physical-before'));
  for(let i=0;i<p.batches.length;i+=8){const ids=Array.from({length:8},(_,n)=>i+n).filter(n=>n<p.batches.length&&!log.completed.includes(n));if(!ids.length)continue;sql(`begin;${context}${deps}${ids.flatMap(n=>p.batches[n]).join('\n')}${check}${cleanQueue()}${mode==='dry'?'rollback':'commit'};`);log.completed.push(...ids);save(mode,log);if(i%40===0||i+8>=p.batches.length)console.log(`${mode} ${Math.min(i+8,p.batches.length)}/${p.batches.length}`);}
 }else throw Error('Unknown mode');
}
