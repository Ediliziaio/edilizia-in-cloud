/** Fill only missing monthly overhead; no duplication of existing payroll/costs. */
import {C,A,YEAR,AS_OF,MARK,uid,q,guard,sql,read,insert,plan,round} from './demo-company-history.mjs';
guard();const existing=sql(`select category,amount,due_date from company_costs where company_id=${q(C)} and cost_type='fixed' and due_date between '${YEAR}-01-01' and '${YEAR}-12-31'`),batches=[],expenses=[],forecast=[];
const fixed=[['affitti','Ufficio e magazzini',6800,22],['leasing','Leasing flotta',YEAR===2023?0:1680,22],['assicurazioni','RC e flotta',1300,0],['utenze','Energia, acqua e riscaldamento',1700,22],['telefonia','Telefoni e connettività',420,22],['software','Software e progettazione',950,22],['commercialista','Consulenza amministrativa',1200,22],['consulenza_lavoro','Amministrazione personale',800,22],['marketing','Acquisizione clienti',4500,22],['struttura_servizi','Pulizie e servizi',650,22],['cancelleria','Consumabili ufficio',300,22]];
for(let m=1;m<=12;m++){
  const month=`${YEAR}-${String(m).padStart(2,'0')}`,date=new Date(Date.UTC(YEAR,m,0,12)).toISOString().slice(0,10),s=[];
  for(const [category,name,full,vat]of fixed){const target=round(full*(YEAR===2023?.7:1)),baseline=round(existing.filter(c=>c.category===category&&c.due_date.startsWith(month)).reduce((s,c)=>s+Number(c.amount),0)),amount=round(Math.max(0,target-baseline));if(!amount)continue;
    if(date>AS_OF){forecast.push({month,category,amount,recognition:'planned only, no actual expense/payment'});continue;}
    const cost=uid('structure-'+month+'-'+category),gross=round(amount*(1+vat/100));
    s.push(insert('company_costs',{id:cost,company_id:C,name:`DEMO · ${name} · ${month}`,cost_type:'fixed',amount,vat_rate:vat,recurrence:'once',recurrence_auto:false,due_date:date,is_paid:true,paid_date:date,category,notes:MARK+' Integrazione della quota mensile mancante; nessun costo commessa aggiuntivo.'}));
    s.push(insert('prima_nota_entries',{id:uid('structure-cash-'+month+'-'+category),company_id:C,direction:'uscita',category:'altro',description:`DEMO · ${name} · ${month}`,amount:gross,entry_date:date,cost_id:cost,created_by:A,notes:MARK}));
    s.push(insert('scadenze',{id:uid('structure-scad-'+month+'-'+category),company_id:C,tipo:'costo_aziendale',description:`DEMO · ${name} · ${month}`,amount:gross,due_date:date,status:'pagata',paid_amount:gross,paid_date:date,cost_id:cost,is_auto_generated:false,notes:MARK}));
    if(vat)s.push(insert('fatture_ricevute',{id:uid('structure-invoice-'+month+'-'+category),company_id:C,numero_fattura:`DEMO-STR-${month}-${category}`,data_fattura:date,cedente_ragione_sociale:'Fornitore servizi DEMO · '+category,cedente_paese:'IT',tipo_documento:'TD01',imponibile_totale:amount,iva_totale:round(amount*vat/100),totale_documento:gross,stato:'contabilizzata',company_cost_id:cost,righe:[{descrizione:name,quantita:1,prezzo_unitario:amount,aliquota_iva:vat}],note:MARK+' DEMO NON FISCALE. Medesimo costo e pagamento, non sommare due volte.'}));
    expenses.push({cost,month,category,baseline,amount,target});
  }if(s.length)batches.push(s);
}
plan('structure',batches,{company:C,year:YEAR,expenses,forecast,noFutureActual:true});
