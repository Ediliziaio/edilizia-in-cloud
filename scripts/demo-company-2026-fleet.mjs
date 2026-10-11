import { C,A,YEAR,AS_OF,MARK,uid,q,j,sql,guard,read,save,has,insert } from './demo-company-2026.mjs';
import { fleetRenewals } from './demo-company-2026-fleet-model.mjs';
guard();
if(has('fleet-applied'))throw Error('Applied fleet plan immutable');
const d=read('before'),p=fleetRenewals(d,{asOf:AS_OF,marker:MARK,uid}),batches=[];
const tenantCheck=asset=>`do $$begin if not exists(select 1 from mezzi where id=${q(asset)} and company_id=${q(C)} and deleted_at is null) then raise exception 'Asset changed tenant or archived';end if;end $$;`;
for(const renewal of [...p.documents,...p.missing.map(row=>({row}))]) {
  const row={...renewal.row,created_by:A};
  batches.push([tenantCheck(row.mezzo_id),insert('mezzi_documenti',row)]);
}
for(const item of p.maintenance) {
  const costId=uid('fleet-service-cost-'+item.previous),row={...item.row,created_by:A,
    descrizione:item.row.descrizione+' Costo aziendale '+costId+'.'};
  const cost={id:costId,company_id:C,name:'DEMO 2026 · Manutenzione '+item.asset.nome,cost_type:'variable',amount:row.costo,vat_rate:22,
    recurrence:'once',recurrence_auto:false,due_date:row.data,is_paid:true,paid_date:row.data,category:'manutenzione',
    notes:MARK+' Intervento fittizio '+row.id+'. Un solo costo; la fattura ricevuta e la prima nota sono collegamenti, non altre imputazioni.'};
  const gross=Math.round(row.costo*122)/100;
  batches.push([tenantCheck(row.mezzo_id),insert('company_costs',cost),insert('mezzi_manutenzioni',row),
    insert('prima_nota_entries',{id:uid('fleet-service-cash-'+item.previous),company_id:C,direction:'uscita',category:'altro',description:cost.name,amount:gross,entry_date:row.data,cost_id:costId,payment_method:'bonifico',created_by:A,notes:MARK+' Pagamento esclusivamente simulato.'}),
    insert('fatture_ricevute',{id:uid('fleet-service-received-'+item.previous),company_id:C,numero_fattura:'DEMO-MZ-2026-'+row.id.slice(0,8),data_fattura:row.data,
      cedente_ragione_sociale:'Officina DEMO — nessun fornitore reale',cedente_paese:'IT',tipo_documento:'TD01',imponibile_totale:row.costo,iva_totale:Math.round(row.costo*22)/100,totale_documento:gross,
      stato:'contabilizzata',company_cost_id:costId,righe:[{descrizione:cost.name,quantita:1,prezzo_unitario:row.costo,aliquota_iva:22}],note:MARK+' DOCUMENTO FITTIZIO NON FISCALE; non trasmesso a SDI.'})]);
}
const calendar=sql(`select id from marketing_calendars where company_id=${q(C)} order by created_at limit 1`)[0]?.id;
if(!calendar)throw Error('Internal calendar required');
for(const item of p.scheduled) {
  if(!item.date||item.date<AS_OF)throw Error('Upcoming date invalid');
  const name=`DEMO 2026 · ${item.deadline.categoria} · ${item.asset.nome}`,key=item.deadline.riferimento_id;
  batches.push([
    tenantCheck(item.asset.id),
    insert('tasks',{id:uid('fleet-task-'+key),company_id:C,title:name,notes:MARK+' Attività pianificata, non verifica già eseguita. Mezzo '+item.asset.id+'. Nessuna notifica esterna.',status:'da_fare',priority:'alta',due_date:item.date+'T07:00:00Z',category:'altro',created_by:A}),
    insert('appointments',{id:uid('fleet-calendar-'+key),company_id:C,title:name,description:MARK+' Scadenza da gestire. Nessuna prestazione o collaudo già eseguito.',
      appointment_date:item.date,appointment_time:'09:00:00',appointment_end_time:'10:00:00',appointment_type:'generico',is_completed:false,status:'confermato',created_by:A,
      calendar_id:calendar,reminder_minutes:null,reminder_sent:true,booking_email:'nessun-invio@demo-2026.invalid',meeting_provider:'none',meeting_status:'none'})]);
}
save('fleet-manifest',{company:C,year:YEAR,asOf:AS_OF,renewals:p.documents.length,missingDocuments:p.missing.length,services:p.maintenance.length,planned:p.scheduled.length,
  documentIds:[...p.documents.map(r=>r.row.id),...p.missing.map(r=>r.id)],serviceIds:p.maintenance.map(r=>r.row.id),taskIds:p.scheduled.map(r=>uid('fleet-task-'+r.deadline.riferimento_id)),
  maintenanceNet:p.maintenance.reduce((s,r)=>s+r.row.costo,0)});
save('fleet-plan',{company:C,year:YEAR,asOf:AS_OF,marker:MARK,batches});
console.log(JSON.stringify({batches:batches.length,renewals:p.documents.length,missingDocuments:p.missing.length,services:p.maintenance.length,planned:p.scheduled.length}));
