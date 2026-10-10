/** Demo tenant only. Physical decomposition of existing PO costs, not new costs. */
import { C,A,MARK,uid,q,j,insert,read,save,sql,guard,context } from './demo-company-55m.mjs';
const mode=process.argv[2]??'prepare';
const warehouse='8c09c96e-b6a6-c0d6-e2a5-ee93051b4a59',OP=MARK+' [TRACE v1]';
const round=n=>Math.round(n*100)/100;
const catalog=[
  ['Laterizi, cementi, malte e rasanti', [['Cemento 32.5 - sacco 25 kg','sacchi',7.5],['Malta premiscelata - sacco 25 kg','sacchi',8.9],['Rasante cementizio - sacco 25 kg','sacchi',14.5],['Laterizio forato 12 cm','pz',1.8]]],
  ['Piastrelle, pavimenti e rivestimenti', [['Gres 60x60 - scatola 1.44 mq','scatole',38],['Collante C2TE - sacco 25 kg','sacchi',19],['Stucco fughe - confezione 5 kg','confezioni',17],['Battiscopa gres - barra 1 metro','barre',8]]],
  ['Sanitari, rubinetti e accessori bagno', [['Lavabo ceramica 60 cm','pz',140],['WC sospeso completo','pz',240],['Piatto doccia 80x120 cm','pz',310],['Miscelatore lavabo completo','pz',75]]],
  ['Componenti impianti elettrici e idraulici', [['Cavo elettrico 3x2.5 - bobina 100 m','bobine',125],['Tubo multistrato 20 mm - rotolo 50 m','rotoli',95],['Presa elettrica completa','pz',14],['Raccordo multistrato a pressare','pz',8]]],
  ['Serramenti, porte e ferramenta', [['Finestra PVC 2 ante 120x140 cm','pz',450],['Porta interna completa 80x210 cm','pz',210],['Portafinestra PVC 2 ante 140x220 cm','pz',600],['Kit ferramenta e posa serramento','kit',90]]],
  ['Pitture, cartongesso e consumabili', [['Idropittura lavabile - secchio 14 l','secchi',55],['Lastra cartongesso 120x200 cm','lastre',13],['Profilo metallico 3 metri','barre',5],['Nastro carta giunti - rotolo 150 m','rotoli',12]]],
];
const stockIds=catalog.flatMap(([,products],g)=>products.map((_,k)=>uid(`physical-stock-${g}-${k}`)));
function stockRows(){return catalog.flatMap(([,products],g)=>products.map(([name,unit,price],k)=>({id:stockIds[g*4+k],company_id:C,warehouse_id:warehouse,name:'DEMO · '+name,description:OP+' Unità: '+unit+'. Costi di acquisto simulati; movimenti collegati all’OdA già registrato.',quantity:0,unit_cost:price,internal_code:`DEMO-55M-SKU-${g+1}-${k+1}`,tracking_mode:'fungible',min_stock_level:0,created_at:'2024-12-30T08:00:00Z'})));}
const shift=d=>{const dt=new Date(d+'T12:00:00Z');while([0,6].includes(dt.getUTCDay()))dt.setUTCDate(dt.getUTCDate()-1);return dt.toISOString().slice(0,10);};
function fieldValue(f,n){
  const key=f.key;
  if(f.type==='boolean'||f.type==='compound_boolean')return false;
  if(f.type==='select')return f.options?.find(o=>['parziale','vuoto','breve','pvc','battente','gres_porcellanato','sospeso'].includes(o.value))?.value??f.options?.[0]?.value??'';
  if(f.type==='multiselect')return f.required?(f.options?.[0]?[f.options[0].value]:[]):[];
  if(f.type==='currency')return round(25000+n*900);
  if(['dimension','number'].includes(f.type)){
    let value=key.includes('anno')?1995:key.includes('tempistica')?60:key.includes('mq')?12+n%10:key.includes('profond')?22:key.includes('altezza')||key.includes('soffit')?(key.includes('foro')?140:270):key.includes('larghezza')||key.includes('lunghezza')?120:2;
    return Math.min(f.max??Infinity,Math.max(f.min??0,value));
  }
  if(key.includes('colore'))return 'Bianco RAL 9010';
  if(key.includes('formato'))return '60x60';
  if(key==='piano')return String(n%3+1);
  return 'DEMO · rilievo simulato';
}
function values(fields,n){return Object.fromEntries(fields.map(f=>[f.key,fieldValue(f,n)]));}
function prepare(){
  guard();const b=read('operations-before'),manifest=read('business-manifest'),econ=read('operations-economic-before');
  const batches=[],plannedReports=[],plannedMoves=[],plannedSurveys=[];
  for(const job of manifest.orders){
    const order=b.orders.find(o=>o.id===job.id);if(!order||order.company_id!==C||!order.internal_notes?.includes(MARK))throw Error('Not an owned demo job');
    const oldCost=econ.margins.find(m=>m.id===job.id)?.cost;if(oldCost==null)throw Error('Missing baseline cost');
    const statements=[`do $$begin if not exists(select 1 from orders where id=${q(job.id)} and company_id=${q(C)} and internal_notes like ${q('%'+MARK+'%')}) then raise exception 'Job ownership changed';end if;end $$;`,...stockRows().map(s=>insert('warehouse_stock',s))];
    const uscitaId=uid('physical-uscita-'+job.id),lines=[],materials=new Map(job.reports.map(r=>[r.id,[]]));
    for(const [g,[parentName,products]] of catalog.entries()){
      const parent=b.items.find(i=>i.order_id===job.id&&i.name===parentName&&i.notes?.includes(MARK));
      if(!parent||!b.poItems.some(i=>i.order_item_id===parent.id))throw Error('Unlinked existing PO item');
      const reports=job.reports.filter(r=>b.reports.find(o=>o.id===r.id)?.materiali_usati?.some(m=>m.order_item_id===parent.id));
      if(!reports.length)throw Error('No approved phase reports for parent item');
      const price=Number(parent.purchase_price);let assigned=0;
      for(const [k,[name,unit,standardPrice]] of products.entries()){
        const qty=Math.max(1,Math.floor(price*[.32,.28,.24,.16][k]/standardPrice));
        const unitCost=k===3?Math.round((price-assigned)/qty*1e6)/1e6:standardPrice;
        if(unitCost<=0)throw Error('Invalid physical price');assigned+=qty*unitCost;
        const stockId=stockIds[g*4+k],lot=`DEMO-${job.code}-${g+1}-${k+1}`;
        // End-of-job returns only for fungible consumables, not installed fixtures.
        const returned=[0,1,5].includes(g)&&k!==3?Math.floor(qty*.05):0,used=qty-returned;
        const base={company_id:C,stock_item_id:stockId,order_item_id:parent.id,warehouse_id:warehouse,performed_by:A,quantity:qty,unit_cost:unitCost,lot_number:lot,notes:OP+' Dettaglio fisico simulato dell’OdA esistente; non un nuovo costo.'};
        const moves=[{...base,id:uid('physical-in-'+job.id+'-'+g+'-'+k),movement_type:'carico',order_id:null,created_at:job.start+'T07:00:00Z'},
          {...base,id:uid('physical-out-'+job.id+'-'+g+'-'+k),movement_type:'scarico',order_id:job.id,uscita_id:uscitaId,created_at:job.start+'T08:00:00Z'}];
        if(returned)moves.push({...base,id:uid('physical-return-'+job.id+'-'+g+'-'+k),movement_type:'carico',order_id:job.id,quantity:returned,created_at:job.end+'T16:00:00Z',notes:OP+' Reso materiale integro al magazzino, non nota di credito.'});
        plannedMoves.push(...moves);statements.push(...moves.map(m=>insert('warehouse_movements',m)));
        lines.push({stock_item_id:stockId,order_item_id:parent.id,descrizione:'DEMO · '+name,quantita:qty,unita:unit,prezzo_unitario:unitCost,imponibile:round(qty*unitCost),lotto:lot});
        // Integer packs distributed over the approved reports of the corresponding phase.
        reports.forEach((r,i)=>{const count=Math.floor(used/reports.length)+(i<used%reports.length?1:0);if(count)materials.get(r.id).push({stock_item_id:stockId,order_item_id:parent.id,nome:'DEMO · '+name,quantita:count,unita:unit,da_furgone:false,fase_id:r.phaseId,demo_marker:OP});});
      }
      if(round(assigned)!==round(price))throw Error('Physical purchase allocation does not match existing PO');
    }
    // Prepend the parent uscita before the child movements (FK may be added in the future).
    statements.splice(1+stockIds.length,0,insert('warehouse_uscite',{id:uscitaId,company_id:C,warehouse_id:warehouse,numero:`DEMO-USC-2025-${String(job.index+1).padStart(3,'0')}`,numero_seq:1000+job.index+1,anno:2025,data:job.start,destinatario_tipo:'cantiere',order_id:job.id,customer_id:order.customer_id,cliente_snapshot:{ragione_sociale:order.client_name,indirizzo:order.work_address},vettore:{tipo:'mittente'},note:OP+' Uscita interna simulata; DDT fiscale non emesso.',righe:lines,stato:'registrata',created_by:A,created_at:job.start+'T08:00:00Z'}));
    for(const r of job.reports){
      const old=b.reports.find(x=>x.id===r.id);if(!old||old.stato!=='approvato'||!old.descrizione_lavori?.includes(MARK))throw Error('Report ownership/status changed');
      const updated={...old,materiali_usati:materials.get(r.id),note:OP+' Utilizzi fisici simulati; costo già incluso nell’OdA. Resi tracciati separatamente. Nessuna firma reale.'};
      plannedReports.push(updated);
      statements.push(`do $$begin if not exists(select 1 from campo_rapportini where id=${q(r.id)} and company_id=${q(C)} and stato='approvato' and materiali_usati=${j(old.materiali_usati)} and note is not distinct from ${q(old.note)}) then raise exception 'Report changed since audit';end if;end $$;`,
        `update campo_rapportini set materiali_usati=${j(updated.materiali_usati)},note=${q(updated.note)} where id=${q(r.id)} and company_id=${q(C)};`);
    }
    for(const stockId of stockIds)statements.push(`update warehouse_stock s set quantity=(select coalesce(sum(case when movement_type='carico' then quantity else -quantity end),0) from warehouse_movements m where m.stock_item_id=s.id and m.company_id=${q(C)}) where s.id=${q(stockId)} and s.company_id=${q(C)};`);
    statements.push(`do $$begin if (select consuntivo from v_ordine_marginalita where id=${q(job.id)} and company_id=${q(C)}) is distinct from ${oldCost} then raise exception 'Financial costs changed: duplicate inventory expense';end if;end $$;`);
    batches.push(statements);
    const template=b.templates.find(t=>t.category===(/serrament/i.test(order.description)?'infissi':/bagni/i.test(order.description)?'bagno':'ristrutturazione'));
    const ap=b.appointments.find(a=>a.order_id===job.id&&/sopralluogo/i.test(a.title));if(!template||!ap)throw Error('Missing template / existing appointment');
    const date=shift(ap.appointment_date),time=date+'T09:00:00Z',surveyId=uid('structured-survey-'+job.id),areaId=uid('structured-survey-area-'+job.id);
    const survey={id:surveyId,company_id:C,template_id:template.id,order_id:job.id,contact_id:ap.contact_id,appointment_id:ap.id,technician_id:A,created_by:A,code:`DEMO-SOP-2025-${String(job.index+1).padStart(3,'0')}`,mode:'structured',status:'in_progress',header_data:values(template.schema.header_schema.flatMap(s=>s.fields),job.index),address:order.work_address,city:order.work_address?.split(',').at(-1)?.trim()??'',country:'IT',notes:OP+' Misure dimostrative. Foto obbligatorie e firma NON certificate: sopralluogo lasciato in corso.',scheduled_at:time,started_at:time,created_at:time,template_schema_snapshot:template.schema};
    const ss=[insert('surveys',survey),insert('survey_areas',{id:areaId,survey_id:surveyId,name:template.category==='bagno'?'Bagno principale':template.category==='infissi'?'Zona giorno':'Zona giorno e disimpegno',position:0,area_data:values(template.schema.area_definition.fields,job.index),is_complete:false,notes:OP+' Foto panoramiche da acquisire: non simulata la loro presenza.',created_at:time})];
    const types=template.schema.element_types.filter(e=>template.category!=='ristrutturazione'||['pavimento','pareti','soffitto','impianto_elettrico_stanza','porta_interna'].includes(e.key));
    for(const [pos,e] of types.entries()){
      const missing=(e.required_photos??[]).filter(p=>p.required).map(p=>'photo:'+p.key);
      ss.push(insert('survey_elements',{id:uid('structured-survey-element-'+job.id+'-'+e.key),survey_id:surveyId,area_id:areaId,element_type:e.key,element_label:e.label,position:pos,values:values(e.sections.flatMap(s=>s.fields),job.index),quantity:1,notes:OP+' Misure fittizie, non valide per ordinare prodotti reali.',is_complete:missing.length===0,created_at:time}));
      ss.push(`update survey_elements set missing_required_fields=ARRAY[${missing.map(q).join(',')}]::text[] where id=${q(uid('structured-survey-element-'+job.id+'-'+e.key))} and survey_id=${q(surveyId)};`);
    }
    // Correct only our synthetic appointment, keeping real contacts and unrelated appointments untouched.
    ss.push(`do $$begin if not exists(select 1 from appointments where id=${q(ap.id)} and company_id=${q(C)} and updated_at=${q(ap.updated_at)} and description like ${q('%'+MARK+'%')}) then raise exception 'Appointment changed since audit';end if;end $$;`,
      `update appointments set appointment_date=${q(date)},formatted_address=${q(order.work_address)},address_line=${q(order.work_address)},appointment_type='sopralluogo' where id=${q(ap.id)} and company_id=${q(C)};`);
    plannedSurveys.push({survey,elementCount:types.length});batches.push(ss);
  }
  save('physical-operations-plan',{company:C,batches:batches.filter((_,i)=>i%2===0)});
  save('structured-surveys-plan',{company:C,batches:batches.filter((_,i)=>i%2===1)});
  save('physical-operations-sources',{company:C,stocks:stockRows(),moves:plannedMoves,reports:plannedReports,surveys:plannedSurveys});
  console.log({jobs:manifest.orders.length,newSkus:stockIds.length,moves:plannedMoves.length,reports:plannedReports.length,surveys:plannedSurveys.length,surveyElements:plannedSurveys.reduce((s,x)=>s+x.elementCount,0),newCosts:0});
}
if(mode==='prepare')prepare();else if(mode==='align-survey-times'){
  guard();
  sql(`begin;${context}update surveys s set scheduled_at=(a.appointment_date+a.appointment_time) at time zone 'Europe/Rome' from appointments a where s.appointment_id=a.id and s.company_id=${q(C)} and a.company_id=${q(C)} and s.code like 'DEMO-SOP-2025-%' and s.status='in_progress' and s.notes like ${q(OP+'%')} and a.description like ${q(MARK+'%')} and s.scheduled_at is distinct from ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome');commit;`);
  console.log('Demo survey times aligned to existing appointment local time, Europe/Rome.');
}else if(mode==='verify'){
  guard();const p=read('physical-operations-sources'),ids=p.stocks.map(s=>q(s.id)).join(',');
  // Archived revisions are deliberately retained, not additional current bundles.
  const bundleIds=read('business-manifest').orders.map(job=>q(uid('report-bundle-'+job.id))).join(',');
  const [audit]=sql(`select jsonb_build_object('stocks',(select count(*) from warehouse_stock where company_id=${q(C)} and id in(${ids})),'movements',(select count(*) from warehouse_movements where company_id=${q(C)} and stock_item_id in(${ids})),'stockMismatch',(select count(*) from warehouse_stock s where s.company_id=${q(C)} and id in(${ids}) and quantity<>(select coalesce(sum(case when movement_type='carico' then quantity else -quantity end),0) from warehouse_movements m where m.stock_item_id=s.id)),'negativeStock',(select count(*) from warehouse_stock where company_id=${q(C)} and id in(${ids}) and quantity<0),'surveys',(select count(*) from surveys where company_id=${q(C)} and code like 'DEMO-SOP-2025-%'),'fakeSignatures',(select count(*) from surveys where company_id=${q(C)} and code like 'DEMO-SOP-2025-%' and (client_signature_url is not null or status='signed')),'costs',(select jsonb_agg(jsonb_build_object('id',id,'cost',consuntivo)) from v_ordine_marginalita where company_id=${q(C)}),'revenue2025',(select sum(total_amount) from orders where company_id=${q(C)} and deleted_at is null and order_code like 'DEMO-2025-%')) audit`);
  const before=read('operations-economic-before');if(audit.audit.stockMismatch||audit.audit.negativeStock||audit.audit.fakeSignatures||audit.audit.stocks!==24||audit.audit.movements!==p.moves.length||audit.audit.surveys!==48)throw Error('Physical/survey invariant failed');
  for(const old of before.margins){const now=audit.audit.costs.find(c=>c.id===old.id);if(now?.cost!==old.cost)throw Error('Job financial cost changed');}
  save('physical-operations-verified',audit.audit);console.log({...audit.audit,costs:'All existing job costs unchanged'});
  const [deep]=sql(`with physical as (select order_id,stock_item_id,sum(case when movement_type='scarico' then quantity else -quantity end) qty from warehouse_movements where company_id=${q(C)} and order_id is not null and stock_item_id in(${ids}) group by 1,2),usage as (select r.order_id,m->>'stock_item_id' stock_id,sum((m->>'quantita')::numeric) qty from campo_rapportini r cross join lateral jsonb_array_elements(r.materiali_usati) m where r.company_id=${q(C)} and r.stato='approvato' and m->>'demo_marker'=${q(OP)} group by 1,2),daily as (select stock_item_id,created_at::date movement_day,sum(case when movement_type='carico' then quantity else -quantity end) qty from warehouse_movements where company_id=${q(C)} and stock_item_id in(${ids}) group by 1,2),running as (select sum(qty) over(partition by stock_item_id order by movement_day) qty from daily) select jsonb_build_object(
    'usageMismatch',(select count(*) from physical p full join usage u on u.order_id=p.order_id and u.stock_id=p.stock_item_id::text where coalesce(p.qty,0)<>coalesce(u.qty,0)),
    'negativeHistoricalStock',(select count(*) from running where qty<0),
    'newReportPdfs',(select count(*) from campo_rapportini where company_id=${q(C)} and note like ${q(OP+'%')} and pdf_url like '%/trace-%'),
    'newBundles',(select count(*) from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and a.id in(${bundleIds}) and a.file_url like '%/rapportini-trace-%'),
    'surveyElements',(select count(*) from survey_elements e join surveys s on s.id=e.survey_id where s.company_id=${q(C)} and s.code like 'DEMO-SOP-2025-%'),
    'surveyCalendarMismatch',(select count(*) from surveys s join appointments a on a.id=s.appointment_id where s.company_id=${q(C)} and s.code like 'DEMO-SOP-2025-%' and (a.company_id<>s.company_id or a.order_id<>s.order_id or a.appointment_type<>'sopralluogo' or s.scheduled_at is distinct from ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') or extract(isodow from a.appointment_date)>5)),
    'cash',(select sum(case when direction='entrata' then amount else -amount end) from prima_nota_entries where company_id=${q(C)}),
    'revenue',(select sum(imponibile_totale) from documenti_fiscali where company_id=${q(C)} and tipo='fattura' and data_emissione between '2025-01-01' and '2025-12-31' and deleted_at is null and stato not in('bozza','annullata','stornata'))
  ) audit`);
  if(deep.audit.usageMismatch||deep.audit.negativeHistoricalStock||deep.audit.surveyCalendarMismatch||deep.audit.newReportPdfs!==1408||deep.audit.newBundles!==48||deep.audit.surveyElements!==276||deep.audit.cash!==before.cash||deep.audit.revenue!==before.revenue)throw Error('Detailed integration invariants failed: '+JSON.stringify(deep.audit));
  save('physical-operations-deep-verified',deep.audit);console.log(deep.audit);
}else throw Error('prepare | verify');
