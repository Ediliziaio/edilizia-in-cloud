/** Close only the newly requested 2024 demo graph; no shared schema or sending. */
import {C,A,YEAR,MARK,uid,q,j,sql,guard,read,save,has,insert,plan,round} from './demo-company-history.mjs';
import {fiscalLines,serviceRows} from './demo-company-procurement.mjs';
import {unitFor} from './demo-company-procurement-units.mjs';
if(YEAR!==2024)throw Error('This closure is restricted to the new 2024 scenario');
guard();
const stage=process.argv[3];
if(stage==='payroll-dedupe'){
 const before=read('before'),old=before.company_costs.filter(c=>c.notes==='beta-variante-solida'&&c.name.startsWith('[2024]')&&['stipendi','INPS'].includes(c.category));
 if(old.length!==5||round(old.reduce((n,c)=>n+Number(c.amount),0))!==152000)throw Error('Unexpected original payroll summaries');
 save('payroll-summaries-before',old,true);
 const refs=sql("select c.relname table_name,a.attname column_name from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_attribute a on a.attrelid=c.oid and a.attnum=any(f.conkey) where f.contype='f' and f.confrelid='company_costs'::regclass");
 if(refs.some(r=>!/^\w+$/.test(r.table_name)||!/^\w+$/.test(r.column_name)))throw Error('Unexpected cost dependency');
 const s=[`do $$begin if (select count(*) from hr_cedolini where company_id=${q(C)} and anno=2024 and note like ${q(MARK+'%')})<>180 then raise exception 'Detailed replacement payroll not complete';end if;end $$;`];
 for(const c of old){
  const dependencies=[...refs.map(r=>`exists(select 1 from public.${r.table_name} where ${r.column_name}=${q(c.id)})`),`exists(select 1 from bank_transactions where linked_cost_id=${q(c.id)})`];
  s.push(`do $$begin if not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(c.id)} and name=${q(c.name)} and notes='beta-variante-solida' and amount=${c.amount} and vat_rate=0 and order_id is null and purchase_order_id is null and is_paid and paid_date=${q(c.paid_date)}::date) or ${dependencies.join(' or ')} then raise exception 'Original payroll summary changed or gained dependencies';end if;end $$;`);
  s.push(`delete from company_costs where company_id=${q(C)} and id=${q(c.id)} and notes='beta-variante-solida' and amount=${c.amount};`);
 }
 plan(stage,[s],{company:C,year:YEAR,removed:old.map(c=>({id:c.id,name:c.name,amount:c.amount})),reason:'Unlinked synthetic summaries replaced by 180 individual payslips and 24 exact monthly cost summaries; do not add the old totals again.',archive:'payroll-summaries-before'});
}else if(stage==='payroll-links'){
 const costs=sql(`select * from company_costs where company_id=${q(C)} and notes like ${q(MARK+'%')} and category in('stipendi','INPS')`),cash=sql(`select * from prima_nota_entries where company_id=${q(C)} and notes like ${q(MARK+'%')}`),dues=sql(`select * from scadenze where company_id=${q(C)} and notes like ${q(MARK+'%')}`),slips=read('payroll-manifest').payslips,batches=[],links=[];
 save('payroll-links-before',{costs,cash,dues},true);
 if(costs.length!==24||slips.length!==180)throw Error('Complete 2024 payroll required');
 for(let m=1;m<=12;m++){
  const month=`2024-${String(m).padStart(2,'0')}`,ps=slips.filter(p=>p.month===month),s=[];
  if(ps.length!==15||ps.some(p=>!p.issued))throw Error('Month missing actual synthetic payslips');
  for(const [category,labels,key]of [['stipendi',['Stipendi netti','Trattenute simulate'],'gross'],['INPS',['Contributi datore'],'employer']]){
   const cost=costs.find(c=>c.id===uid('salary-cost-'+category+'-'+month)),due=dues.find(d=>d.id===uid('salary-scad-'+category+'-'+month)),pns=labels.map(l=>cash.find(p=>p.id===uid('salary-cash-'+l+'-'+month)));
   const amount=round(ps.reduce((n,p)=>n+p[key],0));
   if(!cost||!due||pns.some(p=>!p||p.cost_id||p.scadenza_id||!p.bank_transaction_id||p.direction!=='uscita')||Number(cost.amount)!==amount||Number(due.amount)!==amount||Number(due.paid_amount)!==amount||!cost.is_paid||due.status!=='pagata'||round(pns.reduce((n,p)=>n+Number(p.amount),0))!==amount||pns.some(p=>p.entry_date!==cost.paid_date||!p.entry_date.startsWith(month)))throw Error('Payroll money/date/source association is ambiguous');
   s.push(`do $$begin if not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(cost.id)} and amount=${amount} and vat_rate=0 and is_paid and paid_date=${q(cost.paid_date)}::date and notes like ${q(MARK+'%')}) then raise exception 'Payroll cost source changed';end if;end $$;`);
   for(const p of pns){s.push(`do $$begin if not exists(select 1 from prima_nota_entries p join bank_transactions b on b.id=p.bank_transaction_id and b.company_id=p.company_id where p.company_id=${q(C)} and p.id=${q(p.id)} and p.cost_id is null and p.scadenza_id is null and p.direction='uscita' and p.amount=${p.amount} and b.amount=-p.amount and b.booking_date=p.entry_date and p.notes like ${q(MARK+'%')}) then raise exception 'Saved payroll payment changed';end if;end $$;`,`update prima_nota_entries set cost_id=${q(cost.id)},scadenza_id=${q(due.id)} where company_id=${q(C)} and id=${q(p.id)} and cost_id is null;`,`update bank_transactions set linked_cost_id=${q(cost.id)},linked_scadenza_id=${q(due.id)} where company_id=${q(C)} and id=${q(p.bank_transaction_id)} and amount=-${p.amount};`);links.push({month,cost:cost.id,pn:p.id,bank:p.bank_transaction_id,due:due.id,amount:Number(p.amount)});}
   s.push(`update scadenze set prima_nota_entry_id=${q(pns[0].id)} where company_id=${q(C)} and id=${q(due.id)} and cost_id=${q(cost.id)};`,`do $$begin if (select sum(amount) from prima_nota_entries where company_id=${q(C)} and cost_id=${q(cost.id)})<>${amount} then raise exception 'Payroll linkage duplicated payment or missed withholding';end if;end $$;`);
  }
  batches.push(s);
 }
 plan(stage,batches,{company:C,year:YEAR,links,newCosts:0,newCash:0,netAndWithholdingEqualGross:true});
}else if(stage==='documents'){
 const costs=sql(`select * from company_costs where company_id=${q(C)} and notes like ${q(MARK+'%')}`),receipts=sql(`select * from fatture_ricevute where company_id=${q(C)} and note like ${q(MARK+'%')}`),cash=sql(`select * from prima_nota_entries where company_id=${q(C)} and notes like ${q(MARK+'%')}`),suppliers=sql(`select id,name from suppliers where company_id=${q(C)}`),batches=[],created=[],linked=[];
 const fallback=suppliers.find(s=>s.name==='DEMO - Logistica e noleggi di cantiere S.r.l.');
 if(!fallback)throw Error('Explicit demo logistics supplier missing');
 for(const c of costs.filter(c=>Number(c.vat_rate)>0)){
  const fs=receipts.filter(f=>f.company_cost_id===c.id);if(fs.length>1)throw Error('Ambiguous receipt '+c.id);
  const supplier=suppliers.find(s=>s.id===c.supplier_id)||suppliers.find(s=>s.name===fs[0]?.cedente_ragione_sociale)||fallback;
  const pn=cash.filter(p=>p.cost_id===c.id&&p.direction==='uscita');if(pn.length>1)throw Error('Ambiguous saved cost payment '+c.id);
  const s=[];
  if(!c.supplier_id)s.push(`update company_costs set supplier_id=${q(supplier.id)} where company_id=${q(C)} and id=${q(c.id)} and supplier_id is null;`);
  if(pn[0]&&!pn[0].supplier_id)s.push(`update prima_nota_entries set supplier_id=${q(supplier.id)} where company_id=${q(C)} and id=${q(pn[0].id)} and cost_id=${q(c.id)} and supplier_id is null;`);
  const net=Number(c.amount),vat=round(net*Number(c.vat_rate)/100),gross=round(net+vat),order=c.order_id||(c.allocations?.length===1?c.allocations[0].order_id:null),date=c.paid_date||c.due_date;
  const f=fs[0]||{id:uid('missing-receipt-'+c.id),company_id:C,numero_fattura:'DEMO-2024-COST-'+c.id.slice(0,8),data_fattura:date,cedente_ragione_sociale:supplier.name,cedente_paese:'IT',tipo_documento:'TD01',imponibile_totale:net,iva_totale:vat,totale_documento:gross,stato:'contabilizzata',company_cost_id:c.id,order_id_suggerito:order,note:MARK+' Documento fittizio del costo già salvato, NON FISCALE. Nessun SDI o doppio costo.'};
  if(!fs[0]){s.push(insert('fatture_ricevute',f));created.push(f.id);}
  if(Number(f.imponibile_totale)!==net||Number(f.totale_documento)!==gross||(pn[0]&&Number(pn[0].amount)!==gross))throw Error('Receipt/payment net-VAT-gross mismatch');
  const rows=[{descrizione:'DEMO - '+c.name,quantita:1,unita_misura:'corpo',prezzo_unitario:net,imponibile:net,aliquota_iva:String(c.vat_rate),imposta:vat,totale_riga:gross}];
  s.push(`update fatture_ricevute set righe=${j(rows)},riepilogo_iva=${j([{aliquota_iva:String(c.vat_rate),imponibile:net,imposta:vat}])},prima_nota_id=${q(pn[0]?.id||null)} where company_id=${q(C)} and id=${q(f.id)} and company_cost_id=${q(c.id)} and note like ${q(MARK+'%')};`);
  s.push(`do $$begin if not exists(select 1 from fatture_ricevute where company_id=${q(C)} and id=${q(f.id)} and company_cost_id=${q(c.id)} and imponibile_totale=${net} and totale_documento=${gross}) then raise exception 'Receipt association failed';end if;end $$;`);
  if(s.length)batches.push(s);linked.push({cost:c.id,receipt:f.id,pn:pn[0]?.id||null,gross});
 }
 plan(stage,batches,{company:C,year:YEAR,created,linked,newCosts:0,newCash:0});
}else if(stage==='vendors'){
 const costs=sql(`select * from company_costs where company_id=${q(C)} and notes like ${q(MARK+'%')} and vat_rate>0`),receipts=sql(`select * from fatture_ricevute where company_id=${q(C)} and note like ${q(MARK+'%')}`),suppliers=sql(`select * from suppliers where company_id=${q(C)}`),batches=[],links=[];
 save('vendors-before',{costs,receipts},true);
 const names={materiali:'Edilmarket DEMO S.r.l.',affitti:'Immobiliare Sedi DEMO S.r.l.',leasing:'Leasing Flotta DEMO S.r.l.',utenze:'Energia e Acqua DEMO S.r.l.',telefonia:'Mobile e Fibra DEMO S.r.l.',software:'Software Progetti DEMO S.r.l.',commercialista:'Studio Contabile DEMO',consulenza_lavoro:'Studio Paghe DEMO',marketing:'Comunicazione DEMO S.r.l.',struttura_servizi:'Pulizie e Vigilanza DEMO S.r.l.',cancelleria:'Office Point DEMO S.r.l.',trasporti_noleggi:'Noleggi e Trasporti DEMO S.r.l.'};
 for(const c of costs){
  const fs=receipts.filter(f=>f.company_cost_id===c.id);if(fs.length!==1)throw Error('Exactly one saved supplier invoice required');const f=fs[0];
  if(f.sdi_id_trasmissione||f.xml_raw||f.xml_url||f.openapi_id||Number(f.imponibile_totale)!==Number(c.amount))throw Error('External or inconsistent document');
  const name=c.category==='subappalti'?f.cedente_ragione_sociale:names[c.category];if(!name)throw Error('Unmapped 2024 supplier category '+c.category);
  const supplier=suppliers.find(s=>s.name===name)||{id:uid('subcontractor-vendor-'+name),company_id:C,name,email:'sub-'+uid(name).slice(0,8)+'@fornitori-demo.invalid',country:'Italia',city:'Milano',address:'DEMO - indirizzo fittizio',postal_code:'20100',province:'MI',is_active:true,vat_rate:22,payment_method:'bonifico_30gg',notes:MARK+' Anagrafica fornitore della squadra simulata. Nessuna partita IVA, contatto o invio reale.'};
  const s=[insert('suppliers',supplier),`do $$begin if not exists(select 1 from suppliers where company_id=${q(C)} and id=${q(supplier.id)} and name=${q(name)}) or not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(c.id)} and amount=${c.amount} and supplier_id is not distinct from ${q(c.supplier_id)}::uuid and notes like ${q(MARK+'%')}) or not exists(select 1 from fatture_ricevute where company_id=${q(C)} and id=${q(f.id)} and company_cost_id=${q(c.id)} and cedente_ragione_sociale=${q(f.cedente_ragione_sociale)} and sdi_id_trasmissione is null and xml_raw is null and xml_url is null and openapi_id is null) then raise exception '2024 supplier source changed';end if;end $$;`,
   `update company_costs set supplier_id=${q(supplier.id)} where company_id=${q(C)} and id=${q(c.id)};`,
   `update fatture_ricevute set cedente_ragione_sociale=${q(name)} where company_id=${q(C)} and id=${q(f.id)};`,
   `update prima_nota_entries set supplier_id=${q(supplier.id)} where company_id=${q(C)} and cost_id=${q(c.id)} and notes like ${q(MARK+'%')};`];
  if(c.purchase_order_id){
   s.push(`update purchase_orders set supplier_id=${q(supplier.id)} where company_id=${q(C)} and id=${q(c.purchase_order_id)} and notes like ${q(MARK+'%')};`);
   s.push(`update order_items set supplier_id=${q(supplier.id)} where order_id=${q(c.order_id)} and notes like ${q(MARK+'%')};`);
  }
  batches.push(s);links.push({cost:c.id,receipt:f.id,supplier:supplier.id,name});
 }
 plan(stage,batches,{company:C,year:YEAR,links,newExpenses:0,newCash:0});
}else if(stage==='products'){
 const data={};
 for(const t of ['purchase_orders','purchase_order_items','ddt_ricezione','warehouse_movements','warehouse_stock','goods_receipts','company_costs','fatture_ricevute','scadenze'])data[t]=sql(`select coalesce(jsonb_agg(to_jsonb(x)),'[]') rows from(select * from ${t} where company_id=${q(C)})x`)[0].rows;
 save('products-before',data,true);
 const pos=data.purchase_orders.filter(p=>p.notes?.startsWith(MARK)),receipts=data.fatture_ricevute.filter(f=>f.note?.startsWith(MARK)),costs=data.company_costs.filter(c=>c.notes?.startsWith(MARK)),batches=[],packing=[],goods=[],details=[];
 if(pos.length!==24)throw Error('Exactly 24 saved 2024 purchase orders required');
 const signatureSQL=`select md5(jsonb_build_object('costs',(select jsonb_agg(jsonb_build_array(id,amount,vat_rate,is_paid,paid_date) order by id) from company_costs where company_id=${q(C)}),'stock',(select jsonb_agg(jsonb_build_array(id,quantity,quantity_reserved) order by id) from warehouse_stock where company_id=${q(C)}),'movements',(select jsonb_agg(jsonb_build_array(id,quantity,movement_type,unit_cost) order by id) from warehouse_movements where company_id=${q(C)}))::text) value`;
 const signature=sql(signatureSQL)[0].value;
 const invariant=`do $$begin if (${signatureSQL}) is distinct from ${q(signature)} then raise exception 'Documentary detail changed costs or physical stock';end if;end $$;`;
 const protect=f=>{if(f.xml_raw||f.xml_url||f.sdi_id_trasmissione||f.openapi_id)throw Error('External invoice must not be edited');return `do $$begin if not exists(select 1 from fatture_ricevute where company_id=${q(C)} and id=${q(f.id)} and imponibile_totale=${f.imponibile_totale} and iva_totale=${f.iva_totale} and totale_documento=${f.totale_documento} and note like ${q(MARK+'%')} and xml_raw is null and xml_url is null and sdi_id_trasmissione is null and openapi_id is null) then raise exception 'Saved 2024 receipt changed';end if;end $$;`;};
 for(const po of pos){
  const items=data.purchase_order_items.filter(i=>i.purchase_order_id===po.id),ids=new Set(items.map(i=>i.order_item_id)),incoming=data.warehouse_movements.filter(w=>ids.has(w.order_item_id)&&w.movement_type==='carico'&&w.notes?.startsWith(MARK)),fs=receipts.filter(f=>f.purchase_order_id===po.id),ddts=data.ddt_ricezione.filter(d=>d.purchase_order_id===po.id);
  if(items.length!==6||incoming.length!==24||fs.length!==1||ddts.length!==1||po.status!=='ricevuto')throw Error('Unique complete 2024 procurement graph required');
  const f=fs[0],ddt=ddts[0],physical=incoming.map(w=>{const stock=data.warehouse_stock.find(s=>s.id===w.stock_item_id);if(!stock)throw Error('Cross-company or missing stock');return {descrizione:stock.name,quantita:Number(w.quantity),unita_misura:unitFor(stock.name),prezzo_unitario:Number(w.unit_cost),stock_item_id:stock.id,order_item_id:w.order_item_id,lotto:w.lot_number,movimento_carico_id:w.id};}),rows=fiscalLines(physical,f.imponibile_totale,f.iva_totale),s=[protect(f)];
  s.push(`update fatture_ricevute set righe=${j(rows)} where company_id=${q(C)} and id=${q(f.id)};`);
  for(const item of items){const id=uid('goods:'+ddt.id+':'+item.id);if(data.goods_receipts.some(g=>g.id===id))throw Error('Receipt detail already exists outside checkpoint');const g={id,company_id:C,order_item_id:item.order_item_id,supplier_id:po.supplier_id,ddt_ricezione_id:ddt.id,warehouse_id:ddt.warehouse_id,receipt_date:ddt.data_ricezione+'T07:00:00',quantity_received:Number(item.quantity_received),ddt_number:ddt.numero_ddt,received_by:A,quality_check_status:'pending',notes:MARK+' Ricezione documentale del capitolo ODA già caricato. Confezioni/lotti nel packing list: nessun secondo carico.',created_at:ddt.data_ricezione+'T07:00:00'};if(!Number.isInteger(g.quantity_received)||g.quantity_received<=0)throw Error('Invalid received chapter');s.push(insert('goods_receipts',g),`update goods_receipts set quality_check_status='ok' where company_id=${q(C)} and id=${q(id)} and quality_check_status='pending';`);goods.push({...g,quality_check_status:'ok'});}
  s.push(`select ricalcola_ricezione_oda(${q(po.id)});`,`update ddt_ricezione set note=${q(MARK+' Consegna del materiale dell’ODA, già caricata e consumata per fase. 6 capitoli commerciali, 24 righe fisiche con confezioni e lotti nel packing list. Nessun secondo carico, costo o pagamento.')} where company_id=${q(C)} and id=${q(ddt.id)};`,`update scadenze set supplier_id=${q(po.supplier_id)} where company_id=${q(C)} and cost_id=${q(f.company_cost_id)} and notes like ${q(MARK+'%')};`,invariant);
  batches.push(s);packing.push({ddt:ddt.id,po:po.id,order:po.order_id,physical});details.push({invoice:f.id,lines:rows.length,net:f.imponibile_totale,gross:f.totale_documento});
 }
 for(const f of receipts.filter(f=>!f.purchase_order_id)){
  const c=costs.find(c=>c.id===f.company_cost_id);if(!c)throw Error('Missing saved expense');let lines;
  if(['subappalti','trasporti_noleggi'].includes(c.category)){const a=round(Number(c.amount)*.7);lines=[{descrizione:c.category==='subappalti'?'DEMO - Lavorazioni della squadra esterna, contratto e SAL collegati':'DEMO - Noleggio attrezzature per le fasi di cantiere',quantita:1,unita_misura:'servizio',prezzo_unitario:a},{descrizione:c.category==='subappalti'?'DEMO - Assistenza, finiture e verifiche di fase':'DEMO - Trasporto, consegna e ritiro in cantiere',quantita:1,unita_misura:'servizio',prezzo_unitario:round(Number(c.amount)-a)}];}else lines=serviceRows(c);
  const rows=fiscalLines(lines,f.imponibile_totale,f.iva_totale,Number(c.vat_rate));batches.push([protect(f),`update fatture_ricevute set righe=${j(rows)} where company_id=${q(C)} and id=${q(f.id)};`,`update scadenze set supplier_id=${q(c.supplier_id)} where company_id=${q(C)} and cost_id=${q(c.id)} and notes like ${q(MARK+'%')};`,invariant]);details.push({invoice:f.id,lines:rows.length,net:f.imponibile_totale,gross:f.totale_documento});
 }
 plan(stage,batches,{company:C,year:YEAR,packing,goods,details,newCosts:0,newCash:0,newStockMovements:0});
}else if(stage==='legacy-cash'){
 const names=['[2024] Materie prime','[2024] Subappalti','[2024] Affitti','[2024] Commercialista','[2024] Interessi mutuo'];
 const original=read('before').company_costs.filter(c=>names.includes(c.name)&&c.notes==='beta-variante-solida');
 if(original.length!==5)throw Error('Unexpected remaining legacy 2024 costs');
 const sources=sql(`select * from company_costs where company_id=${q(C)} and id in(${original.map(c=>q(c.id))})`),receipts=sql(`select * from fatture_ricevute where company_id=${q(C)} and company_cost_id in(${original.map(c=>q(c.id))})`),batches=[],events=[];
 save('legacy-cash-before',{sources,receipts},true);
 for(const old of original){
  const c=sources.find(c=>c.id===old.id),fs=receipts.filter(f=>f.company_cost_id===old.id);
  if(!c||c.notes!=='beta-variante-solida'||Number(c.amount)!==Number(old.amount)||!c.is_paid||c.paid_date!==old.paid_date||!c.paid_date.startsWith('2024-'))throw Error('Original paid cost changed');
  if(fs.length!==Number(Number(c.vat_rate)>0)||fs.some(f=>!f.note?.includes('DEMO')||f.xml_raw||f.xml_url||f.sdi_id_trasmissione||f.openapi_id||f.prima_nota_id))throw Error('Unexpected fiscal origin or existing settlement');
  const gross=round(Number(c.amount)*(1+Number(c.vat_rate)/100)),pn=uid('legacy-cash-'+c.id),due=uid('legacy-due-'+c.id);
  if(fs.some(f=>Number(f.totale_documento)!==gross))throw Error('Legacy VAT/gross differs');
  const s=[`do $$begin if exists(select 1 from prima_nota_entries where company_id=${q(C)} and cost_id=${q(c.id)}) or exists(select 1 from bank_transactions where company_id=${q(C)} and linked_cost_id=${q(c.id)}) or exists(select 1 from scadenze where company_id=${q(C)} and cost_id=${q(c.id)}) or not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(c.id)} and notes='beta-variante-solida' and is_paid and paid_date=${q(c.paid_date)}::date and amount=${c.amount} and vat_rate=${c.vat_rate}) then raise exception 'Legacy settlement changed or already represented';end if;end $$;`,
   insert('scadenze',{id:due,company_id:C,tipo:'costo_aziendale',description:c.name,amount:gross,due_date:c.due_date,status:'pagata',paid_amount:gross,paid_date:c.paid_date,cost_id:c.id,is_auto_generated:false,notes:MARK+' Pagamento storico già indicato sul costo; non un nuovo debito.'}),
   insert('prima_nota_entries',{id:pn,company_id:C,direction:'uscita',category:Number(c.vat_rate)>0?'pagamento_fornitore':'altro',description:'DEMO · '+c.name,amount:gross,entry_date:c.paid_date,cost_id:c.id,scadenza_id:due,supplier_id:c.supplier_id,created_by:A,notes:MARK+' Ricostruzione del pagamento fittizio già salvato. Nessun nuovo costo o bonifico. Per gli interessi, sola quota interessi: nessun capitale rimborsato inventato.'})];
  for(const f of fs)s.push(`update fatture_ricevute set prima_nota_id=${q(pn)} where company_id=${q(C)} and id=${q(f.id)} and company_cost_id=${q(c.id)} and prima_nota_id is null;`);
  batches.push(s);events.push({cost:c.id,pn,due,gross,date:c.paid_date,existingNet:Number(c.amount)});
 }
 plan(stage,batches,{company:C,year:YEAR,events,newExpenses:0,source:'Explicit original is_paid and paid_date; no payments inferred from due dates'});
}else throw Error('payroll-dedupe | payroll-links | documents | vendors | products | legacy-cash; use the history rollback/apply runner');
