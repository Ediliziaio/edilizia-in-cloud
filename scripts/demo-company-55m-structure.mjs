/** Structure expenses and equipment usage. No accounting or stock duplication. */
import {C,A,MARK,uid,q,read,save,insert,guard} from './demo-company-55m.mjs';
import {existsSync} from 'node:fs';
if(existsSync('tmp/demo-integrated/annual-55m/structure-applied.json'))throw Error('Applied plan immutable');
guard();const d=read('before'),r=read('resources-manifest'),jobs=read('business-manifest').orders,round=n=>Math.round(n*100)/100;
const batches=[],mapping=read('cost-classification'),classification=[];
const definitions=[['materiali','acquisti_materie','V','Materiali da ODA'],['trasporti_noleggi','costi_produttivi','V','Trasporti e noleggi diretti'],['leasing','costi_produttivi','F','Leasing flotta'],['assicurazioni','costi_produttivi','F','Assicurazioni aziendali'],['utenze','costi_produttivi','F','Utenze sedi'],['struttura_immobili','costi_produttivi','F','Ufficio e magazzini'],['struttura_servizi','costi_amministrativi','F','Servizi e pulizie'],['ammortamenti_demo','ammortamenti','F','Quota annua beni posseduti']];
for(const [category,macro,tipo,description]of definitions)if(!mapping.some(m=>m.source_table==='company_costs'&&m.source_value===category&&m.is_active))classification.push(insert('cg_classificazione_voci',{id:uid('mapping-'+category),company_id:C,voce_chiave:'demo55_'+category,voce_descrizione:description,macro_voce:macro,tipo,source_table:'company_costs',source_field:'category',source_value:category,ordering:950+classification.length,is_active:true}));
batches.push(classification);
const fixed=[['affitti','Affitto ufficio e due magazzini',6800,22],['leasing','Leasing tre furgoni',1680,22],['assicurazioni','Assicurazioni RC e flotta',1300,0],['utenze','Energia, acqua e riscaldamento',1700,22],['telefonia','Connettività e telefoni',420,22],['software','Software gestionale e progettazione',950,22],['commercialista','Consulenza amministrativa',1200,22],['consulenza_lavoro','Gestione personale',800,22],['marketing','Marketing e acquisizione clienti',4500,22],['struttura_servizi','Pulizie, vigilanza e servizi',650,22],['cancelleria','Ufficio e consumabili non produttivi',300,22]];
const manifest={company:C,marker:MARK,monthlyStructure:fixed.reduce((s,x)=>s+x[2],0),expenses:[],tools:[],maintenance:[]};
for(let m=1;m<=12;m++){
  const month='2025-'+String(m).padStart(2,'0'),date=new Date(Date.UTC(2025,m,0,12)).toISOString().slice(0,10),statements=[];
  for(const [category,name,amount,vat]of fixed){
    const old=d.company_costs.find(c=>c.category===category&&c.due_date?.startsWith(month)&&c.notes==='beta-variante-transizione'&&!d.prima_nota_entries.some(p=>p.cost_id===c.id)&&!d.scadenze.some(s=>s.cost_id===c.id)),id=old?.id||uid('structure-'+category+'-'+month),gross=round(amount*(1+vat/100));
    if(old)statements.push(`update company_costs set name=${q('DEMO · '+name+' · '+month)},amount=${amount},vat_rate=${vat},due_date=${q(date)},paid_date=${q(date)},is_paid=true,recurrence='once',recurrence_auto=false,notes=${q(MARK+' Riepilogo mensile; precedente aggregato dimostrativo conservato nello snapshot di audit.')} where id=${q(id)} and company_id=${q(C)} and amount=${Number(old.amount)} and notes='beta-variante-transizione';`);
    else statements.push(insert('company_costs',{id,company_id:C,name:'DEMO · '+name+' · '+month,cost_type:'fixed',amount,vat_rate:vat,recurrence:'once',recurrence_auto:false,due_date:date,is_paid:true,paid_date:date,category,notes:MARK+' Spesa aziendale. Nessuna seconda imputazione diretta sulle commesse.'}));
    statements.push(insert('prima_nota_entries',{id:uid('structure-cash-'+category+'-'+month),company_id:C,direction:'uscita',category:'altro',description:'DEMO · '+name+' · '+month,amount:gross,entry_date:date,cost_id:id,payment_method:'bonifico',created_by:A,notes:MARK}));
    statements.push(insert('scadenze',{id:uid('structure-scad-'+category+'-'+month),company_id:C,tipo:'costo_aziendale',description:'DEMO · '+name+' · '+month,amount:gross,due_date:date,status:'pagata',paid_amount:gross,paid_date:date,cost_id:id,payment_method:'bonifico',is_auto_generated:false,notes:MARK}));
    // Supplier invoice only for actual taxable services, not fictitious fiscal
    // identities. Accounting points to the cost already above.
    if(vat)statements.push(insert('fatture_ricevute',{id:uid('structure-received-'+category+'-'+month),company_id:C,numero_fattura:'DEMO-STR-'+category+'-'+month,data_fattura:date,cedente_ragione_sociale:'Fornitore servizi DEMO · '+category,cedente_paese:'IT',tipo_documento:'TD01',imponibile_totale:amount,iva_totale:round(amount*vat/100),totale_documento:gross,stato:'contabilizzata',company_cost_id:id,righe:[{descrizione:name,quantita:1,prezzo_unitario:amount,aliquota_iva:vat}],note:MARK+' DEMO NON FISCALE. Stesso costo già contabilizzato, nessun XML reale.'}));
    manifest.expenses.push({id,month,category,amount,gross});
  }batches.push(statements);
}
// A fully-owned capital asset is not a leasing expense or a new 2025 purchase.
const owned=r.fleet.filter(f=>f.possesso==='proprieta'),depreciation=round(owned.reduce((s,f)=>s+Number(f.valore_acquisto)*.2,0));
batches.push([insert('company_costs',{id:uid('depreciation-2025'),company_id:C,name:'DEMO · Ammortamento flotta e attrezzature proprie 2025',cost_type:'fixed',amount:depreciation,vat_rate:0,recurrence:'once',recurrence_auto:false,due_date:'2025-12-31',is_paid:false,category:'ammortamenti_demo',notes:MARK+' Quota gestionale non monetaria al 20%; nessuna scadenza di pagamento o movimento di cassa.'})]);
const occupied=new Set();
for(const job of jobs){const statements=[],tool=r.fleet[6+job.index%6];
  for(const date of job.dates.filter((_,i)=>i%10===0)){
    if(occupied.has(tool.id+'|'+date))continue;occupied.add(tool.id+'|'+date);const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Rome',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value==='GMT+2'?'+02:00':'+01:00',start=date+'T08:00:00'+offset,end=date+'T17:00:00'+offset;
    statements.push(insert('mezzi_assegnazioni',{id:uid('tool-assignment-'+job.index+'-'+date),company_id:C,mezzo_id:tool.id,order_id:job.id,dal:start,al:end,created_by:A,note:MARK+' Uso giornaliero senza sovrapposizioni; eventuale noleggio incluso nei costi diretti, non addebito aggiuntivo.'}));
    statements.push(insert('mezzi_giornate',{id:uid('tool-day-'+job.index+'-'+date),company_id:C,mezzo_id:tool.id,order_id:job.id,user_id:A,giorno:date,usato:true,dove:'cantiere',rapportino_id:job.reports.find(p=>p.date===date)?.id||null}));manifest.tools.push({order:job.id,asset:tool.id,date});
  }if(statements.length)batches.push(statements);
}
const maintenance=[];
for(const [i,asset]of r.fleet.entries()){
  if(asset.possesso==='noleggio_breve')continue;
  const amount=asset.tipo==='furgone'?480:120,id=uid('maintenance-cost-'+i),date=i<6?'2025-05-20':'2025-06-18';
  maintenance.push(insert('company_costs',{id,company_id:C,name:'DEMO · Manutenzione '+asset.nome,cost_type:'variable',amount,vat_rate:22,recurrence:'once',recurrence_auto:false,due_date:date,is_paid:true,paid_date:date,category:'manutenzione',notes:MARK+' Stessa manutenzione del bene, registrata una sola volta.'}));
  maintenance.push(insert('mezzi_manutenzioni',{id:uid('maintenance-'+i),company_id:C,mezzo_id:asset.id,tipo:'manutenzione_ordinaria',data:date,costo:amount,officina:'Officina e manutenzione DEMO',descrizione:MARK+' Intervento sintetico; costo aziendale '+id+'. Nessun certificato di sicurezza.',prossima_data:'2026-05-20',created_by:A}));
  maintenance.push(insert('prima_nota_entries',{id:uid('maintenance-cash-'+i),company_id:C,direction:'uscita',category:'altro',description:'DEMO manutenzione '+asset.nome,amount:round(amount*1.22),entry_date:date,cost_id:id,created_by:A,payment_method:'bonifico',notes:MARK}));manifest.maintenance.push({asset:asset.id,cost:id,amount});
}batches.push(maintenance);
save('structure-manifest',manifest);save('structure-plan',{company:C,marker:MARK,batches});console.log({batches:batches.length,monthlyStructure:manifest.monthlyStructure,expenses:manifest.expenses.length,toolDays:manifest.tools.length,maintenance:manifest.maintenance.length,depreciation});
