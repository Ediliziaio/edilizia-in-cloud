/** Isolated, reproducible management-accounting fixtures. No real recipients.
 * node scripts/demo-cfo.mjs [prepare|dry-run|seed|verify|photos]
 * dry-run executes all business triggers and assertions, then ROLLBACK.
 * seed refuses partial/existing data; it never overwrites somebody's changes.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const company = 'd2000000-0000-4000-a000-000000000002';
const actor = 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
const warehouse = '8c09c96e-b6a6-c0d6-e2a5-ee93051b4a59';
const marker = '[DEMO CFO 2026-09 v1]';
const out = resolve('work/demo-cfo');
mkdirSync(out, { recursive: true });
const uuid = key => { const h=createHash('md5').update(`${marker}:${key}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`; };
const q = v => v == null ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
const json = v => `${q(JSON.stringify(v))}::jsonb`;
const arr = v => `ARRAY[${v.map(q).join(',')}]::text[]`;
const rows = [];
const records = [];
function insert(table,key,data,raw={}) {
  const id=uuid(key); const d={id,...data}; const keys=[...Object.keys(d),...Object.keys(raw)];
  rows.push(`INSERT INTO public.${table} (${keys.join(',')}) VALUES (${[...Object.values(d).map(q),...Object.values(raw)].join(',')});`);
  records.push({table,id,key}); return id;
}
function query(sql) {
  const raw=execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8',maxBuffer:20*1024*1024});
  return JSON.parse(raw).rows;
}
const phases=['Allestimento e demolizioni','Opere murarie','Impianti e predisposizioni','Massetti e impermeabilizzazione','Pavimenti e rivestimenti','Serramenti e dotazioni','Tinteggiature','Finiture e consegna'];
const dates=['2026-08-03','2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21'];
const jobs=[
  {key:'int',code:'DEMO-CFO-INT-01',name:'DEMO · Appartamento Aurora · solo operai interni',client:'Famiglia Aurora (fittizia)',revenue:72000,variation:0,workers:[0,1],days:40,sub:0,direct:2400,
   goods:[['Gres porcellanato 60×60 (m²)',110,32,4],['Finestre PVC complete (pz)',5,920,5],['Porte interne (pz)',6,280,5],['Sanitari e rubinetterie (kit)',2,1450,5],['Materiale elettrico (kit)',1,2600,2],['Tubazioni e collettori (kit)',1,2100,2],['Lastre e profili cartongesso (kit)',1,1850,1],['Pittura lavabile (secchio)',12,65,6]]},
  {key:'mix',code:'DEMO-CFO-MIX-02',name:'DEMO · Casa Betulla · interni e subappalti',client:'Famiglia Betulla (fittizia)',revenue:86000,variation:3500,workers:[2],days:34,sub:23000,direct:2850,
   goods:[['Gres bagno e cucina (m²)',120,38,4],['Doccia filo pavimento (kit)',2,1350,5],['Mobili lavabo (pz)',2,980,5],['Sanitari sospesi (coppia)',2,780,5],['Finestre PVC (pz)',6,890,5],['Porte interne (pz)',5,310,5],['Collettori e tubazioni (kit)',1,2800,2],['Quadro e frutti elettrici (kit)',1,3200,2],['Pittura (secchio)',10,72,6]]},
  {key:'sub',code:'DEMO-CFO-SUB-03',name:'DEMO · Ufficio Cedro · solo subappalti',client:'Studio Cedro (fittizio)',revenue:105000,variation:0,workers:[],days:16,sub:50500,direct:3500,
   goods:[['Pavimento gres ufficio (m²)',160,30,4],['Pareti vetrate (modulo)',6,850,1],['Porte ufficio (pz)',6,390,5],['Corpi illuminanti LED (pz)',24,95,2],['Controsoffitto (m²)',120,22,1],['Pittura ufficio (secchio)',10,60,6]]},
];
const images={
 int:['f958bfa0-37eb-4221-95ae-01ccdce1df37','92a77359-dc80-4f82-a521-abce87f09bde','bcdefe67-ca94-450f-9d4a-1a303e8509ab'],
 mix:['1734cac2-2636-48ee-a83d-80965a2f2818','e9c2107f-c214-4ee6-99bd-e33a4bfe7fe6','644281e8-6dfe-4b50-b90f-0d216ee3959e'],
 sub:['f2fc03d3-59a5-40ca-9004-786faaa399d6','200c7792-c9e6-471a-82d3-3a0c4d429dcd','7aa33505-e485-496a-b099-cc3948e06d19'],
};
const auth=`SELECT set_config('request.jwt.claim.sub',${q(actor)},true);`;
const guard=`DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM companies WHERE id=${q(company)} AND name ILIKE '%Demo%2%') THEN RAISE EXCEPTION 'Demo company not verified'; END IF;
 IF NOT public.user_can_access_company(${q(company)}) THEN RAISE EXCEPTION 'Actor cannot access Demo company'; END IF;
 IF EXISTS (SELECT 1 FROM orders WHERE order_code IN (${jobs.map(j=>q(j.code)).join(',')})) THEN RAISE EXCEPTION 'Demo already exists: use verify, never overwrite'; END IF;
 IF EXISTS (SELECT 1 FROM internal_automation_flows WHERE company_id=${q(company)} AND status='published') OR EXISTS (SELECT 1 FROM automations WHERE company_id=${q(company)} AND is_active) THEN RAISE EXCEPTION 'Review active automations before seeding'; END IF;
END $$;`;
const supplier=insert('suppliers','supplier',{company_id:company,name:'DEMO CFO · Materiali e forniture',email:'forniture@demo-cfo.invalid',notes:`${marker} Fornitore fittizio, nessun invio.`});
const rates=[28,24,30];
const employees=rates.map((rate,i)=>insert('employees',`employee-${i}`,{company_id:company,first_name:['Luca','Marco','Elena'][i],last_name:`Demo CFO ${i+1}`,email:`operaio${i}@demo-cfo.invalid`,costo_orario:rate,monthly_hours:168,area:'cantiere',is_active:true}));
const stock=insert('warehouse_stock','cemento',{company_id:company,warehouse_id:warehouse,name:'DEMO CFO · Premiscelato cementizio sacco 25 kg',quantity:200,unit_cost:7.5,supplier_id:supplier,internal_code:'DEMO-CFO-CEM25',min_stock_level:10});

for (const job of jobs) {
 job.id=insert('orders',`order-${job.key}`,{company_id:company,order_code:job.code,description:job.name,client_name:job.client,client_email:`${job.key}@demo-cfo.invalid`,total_amount:job.revenue,vat_rate:10,work_start_date:'2026-08-01',work_end_date:'2026-09-30',work_address:'Indirizzo dimostrativo · nessun cantiere reale',work_description:'Ristrutturazione parziale · simulazione di due mesi',internal_notes:`${marker} Dati e foto sintetici. Nessun documento fiscale reale. Costi netti; incassi IVA inclusa.`,created_by:actor,order_type:'cliente',weekly_report_enabled:false,giornale_auto_enabled:false,percentuale_avanzamento:100});
 job.phases=phases.map((name,i)=>insert('order_work_phases',`${job.key}-phase-${i}`,{company_id:company,order_id:job.id,name,position:i,status:'completata',start_date:dates[i],end_date:i===7?'2026-09-30':dates[i+1],percentuale:100,notes:marker}));
 if(job.variation) insert('ordini_variazione',`${job.key}-variation`,{company_id:company,order_id:job.id,numero_odv:1,titolo:'DEMO · Rivestimento e nicchia doccia aggiuntivi',descrizione:'Variante fittizia approvata per collaudo, senza firma simulata.',impatto_economico:job.variation,impatto_giorni:0,status:'approvato',created_by:actor});
 const purchase=job.goods.reduce((sum,[,qty,price])=>sum+qty*price,0);
 const po=insert('purchase_orders',`${job.key}-po`,{company_id:company,order_id:job.id,supplier_id:supplier,oda_number:`ODA-${job.code}`,status:'ricevuto',issue_date:'2026-08-03',expected_delivery_date:'2026-08-10',actual_delivery_date:'2026-08-10',subtotal:purchase,vat_total:purchase*.22,total:purchase*1.22,notes:marker,created_by:actor});
 job.goods.forEach(([name,quantity,price,p],i)=>{
  const item=insert('order_items',`${job.key}-item-${i}`,{order_id:job.id,name,description:marker,quantity,purchase_price:price,unit_price:Math.round(price*1.4*100)/100,supplier_id:supplier,phase_id:job.phases[p],position:i,vat_rate:22,status:'consegnato',fulfillment_status:'installed',quantity_received:quantity});
  insert('purchase_order_items',`${job.key}-poi-${i}`,{company_id:company,purchase_order_id:po,order_item_id:item,description:name,quantity,unit_price:price,vat_rate:22,quantity_received:quantity,received_date:'2026-08-10',sort_order:i});
 });
 const cementoQty=job.key==='int'?80:job.key==='mix'?50:30;
 const cementoReturn=job.key==='int'?10:job.key==='mix'?5:0;
 insert('order_items',`${job.key}-cemento-item`,{order_id:job.id,name:'DEMO · Premiscelato cementizio (sacco 25 kg)',quantity:cementoQty-cementoReturn,purchase_price:7.5,stock_item_id:stock,phase_id:job.phases[3],position:20,vat_rate:22});
 rows.push(`DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM register_warehouse_uscita(${q(warehouse)},${json({tipo:'cantiere',order_id:job.id})},${json([{stock_item_id:stock,quantity:cementoQty}])},NULL,${q(marker)}); IF jsonb_array_length(r.errors)>0 OR r.created_movements<>1 THEN RAISE EXCEPTION 'Warehouse failed %',r.errors; END IF; UPDATE warehouse_uscite SET data='2026-08-24' WHERE id=r.uscita_id; END $$;`);
 if(cementoReturn) {
  insert('warehouse_movements',`${job.key}-reso`,{company_id:company,stock_item_id:stock,warehouse_id:warehouse,order_id:job.id,movement_type:'carico',quantity:cementoReturn,unit_cost:7.5,performed_by:actor,created_at:'2026-09-25T16:00:00Z',notes:`${marker} Reso materiale integro non consumato`});
  rows.push(`UPDATE warehouse_stock SET quantity=quantity+${cementoReturn} WHERE id=${q(stock)};`);
 }
 // Each report is a real daily transition: submitted -> approved; no auth users created.
 for(let d=0;d<job.days;d++) {
  const day=new Date('2026-08-03T12:00:00Z'); let offset=Math.floor(d*42/(job.days-1));
  while(offset>0) {day.setUTCDate(day.getUTCDate()+1);if(day.getUTCDay()!==0&&day.getUTCDay()!==6)offset--;}
  const date=day.toISOString().slice(0,10);const p=Math.min(7,Math.floor(d/job.days*8));
  const report=insert('campo_rapportini',`${job.key}-report-${d}`,{company_id:company,order_id:job.id,user_id:null,role_type:job.workers.length?'employee':'subcontractor',data_lavoro:date,ore_lavorate:8,descrizione_lavori:`${marker} ${phases[p]}. ${job.workers.length?'Ore effettive della squadra interna, collaudo.':'Lavorazioni affidate alla ditta esterna: ore descrittive, costo da contratto.'}`,stato:'inviato',approvato:false,source:'manual',note:'Simulazione: nessuna firma o geolocalizzazione reale.'},{presenze:json(job.workers.map(i=>({employee_id:employees[i],ore:8}))),fasi_lavorate:json([{phase_id:job.phases[p],ore:8}]),foto_urls:arr([`campo-rapportini/${company}/${job.id}/demo-cfo-${d===0?'prima':d===job.days-1?'finale':'lavori'}.jpg`])});
  rows.push(`UPDATE campo_rapportini SET stato='approvato',approvato=true,approvato_da=${q(actor)},approvato_at=${q(date+'T17:00:00Z')} WHERE id=${q(report)};`);
 }
 if(job.sub) {
  const sub=insert('subappaltatori',`${job.key}-sub`,{company_id:company,ragione_sociale:`DEMO CFO · ${job.key==='mix'?'Impianti Betulla':'Edilizia Cedro'}`,email:`${job.key}-sub@demo-cfo.invalid`,notes:marker});
  const safety=insert('subappaltatori_sicurezza',`${job.key}-sicurezza`,{company_id:company,order_id:job.id,ragione_sociale:`DEMO CFO · Ditta ${job.key}`,campo_subappaltatore_id:sub,data_inizio:'2026-08-01',data_fine:'2026-09-30',note:marker});
  const team=insert('external_teams',`${job.key}-team`,{company_id:company,name:`DEMO CFO · Squadra ${job.key}`,subappaltatore_id:sub,kind:'esterna',notes:marker,is_active:true});
  const contract=insert('contratti_subappalto',`${job.key}-contract`,{company_id:company,order_id:job.id,subappaltatore_id:safety,numero_contratto:`SUB-${job.code}`,descrizione_lavori:job.key==='mix'?'Impianti, posa dotazioni e collaudi':'Tutte le lavorazioni manuali; materiali separati',importo_contrattuale:job.sub,ritenuta_garanzia_pct:5,data_inizio:'2026-08-01',data_fine_prevista:'2026-09-30',stato:'completato',note:`${marker} Costo imputato una sola volta nelle assegnazioni per fase. SAL = liquidazione, non costo aggiuntivo.`});
  const indices=job.key==='mix'?[2,5]:[0,1,2,3,4,5,6,7];
  indices.forEach((p,i)=>insert('order_external_teams',`${job.key}-assignment-${p}`,{order_id:job.id,external_team_id:team,phase_id:job.phases[p],total_cost:job.sub/indices.length,cost_preventivo:job.sub/indices.length,vat_rate:22,is_paid:false,notes:`${marker} Quota contratto ${job.code} · non sommare nuovamente i SAL.`}));
  for(let n=0;n<2;n++) insert('sal_subappaltatori',`${job.key}-sub-sal-${n}`,{company_id:company,order_id:job.id,contratto_id:contract,subappaltatore_id:safety,numero_sal:n+1,data_emissione:n?'2026-09-30':'2026-08-31',importo_lordo:job.sub/2,ritenuta_pct:5,stato:n?'verificato':'pagato',data_pagamento:n?null:'2026-09-10',note:marker});
 }
 const labels=['Gasolio e trasporti dedicati','Noleggio attrezzatura cantiere','Smaltimenti e oneri diretti'];
 labels.forEach((name,i)=>insert('company_costs',`${job.key}-cost-${i}`,{company_id:company,order_id:job.id,name:`DEMO CFO · ${job.key} · ${name}`,cost_type:'variable',recurrence:'once',amount:i===2?job.direct-2*Math.floor(job.direct/3):Math.floor(job.direct/3),due_date:'2026-09-30',vat_rate:22,is_paid:i===0,paid_date:i===0?'2026-09-25':null,notes:marker,payment_method:'bonifico'}));
 ['furgone','attrezzatura'].forEach((tipo,i)=>{
  const mezzo=insert('mezzi',`${job.key}-mezzo-${i}`,{company_id:company,nome:`DEMO CFO · ${job.key} · ${i?'Miscelatore e aspiratore':'Furgone cantiere'}`,tipo,possesso:i?'noleggio_breve':'proprieta',contatore_unita:i?'ore':'km',note:`${marker} Costi reali già registrati in commessa; nessuna rata stimata duplicata.`,created_by:actor});
  insert('mezzi_assegnazioni',`${job.key}-mezzo-ass-${i}`,{company_id:company,mezzo_id:mezzo,order_id:job.id,dal:'2026-08-01',al:'2026-09-30',note:marker,created_by:actor});
 });
 const gross=(job.revenue+job.variation)*1.1;
 [0.3,0.4,0.3].forEach((share,i)=>insert('order_installments',`${job.key}-incasso-${i}`,{order_id:job.id,position:i,label:['Acconto contratto DEMO','SAL agosto DEMO','Saldo finale DEMO'][i],type:i===2?'balance':'deposit',amount:Math.round(gross*share*100)/100,is_paid:i<2,paid_date:i===0?'2026-08-01':i===1?'2026-09-05':null,expected_date:['2026-08-01','2026-09-05','2026-10-15'][i]}));
 [0,1].forEach(i=>{
  const sal=insert('sal_records',`${job.key}-sal-${i}`,{company_id:company,order_id:job.id,numero_sal:i+1,data_emissione:i?'2026-09-30':'2026-08-31',importo_totale:(job.revenue+job.variation)*(i?.3:.4),stato:'approvato',installment_id:uuid(`${job.key}-incasso-${i+1}`),note:`${marker} SAL della rata, non cumulativo né documento fiscale. Nessuna firma inventata.`,created_by:actor});
  insert('sal_voci',`${job.key}-sal-voce-${i}`,{sal_id:sal,descrizione:i?'Completamento delle opere · quota saldo':'Lavorazioni di agosto · quota intermedia',importo_contrattuale:job.revenue+job.variation,percentuale_avanzamento:i?30:40,note:marker});
 });
 rows.push(`UPDATE order_employees SET cost_preventivo=round(total_cost*0.95,2),notes=${q(marker+' Ore approvate dai rapportini; budget simulato inferiore del 5%.')} WHERE order_id=${q(job.id)};`);
 ['prima','lavori','finale'].forEach((stage,i)=>insert('foto_cantiere',`${job.key}-foto-${stage}`,{company_id:company,order_id:job.id,uploaded_by:actor,storage_path:`${company}/${job.id}/demo-cfo-${stage}.jpg`,taken_at:['2026-08-01T10:00:00Z','2026-08-25T10:00:00Z','2026-09-30T10:00:00Z'][i],descrizione:`${marker} ${stage}: immagine sintetica illustrativa, non prova di lavori eseguiti.`,visibile_cliente:false},{tags:arr(['demo','sintetica',stage])}));
 const labor=job.workers.reduce((sum,i)=>sum+rates[i]*job.days*8,0);
 const materials=(cementoQty-cementoReturn)*7.5;
 job.expected={revenue:job.revenue+job.variation,purchase,labor,sub:job.sub,materials,direct:job.direct,hours:job.workers.length*job.days*8,consuntivo:purchase+labor+job.sub+materials+job.direct,stockOut:cementoQty,stockReturn:cementoReturn};
 job.expected.margin=job.expected.revenue-job.expected.consuntivo;
}
// Clear ONLY events created by this transaction for our own fixture entities.
const ids=records.map(r=>q(r.id)).join(',');
rows.push(`DELETE FROM automation_trigger_events WHERE company_id=${q(company)} AND created_at>=transaction_timestamp() AND (entity_id IN (${ids}) OR EXISTS (SELECT 1 FROM unnest(ARRAY[${ids}]::text[]) x WHERE payload::text LIKE '%'||x||'%'));
DELETE FROM wa_notifiche_event_queue WHERE company_id=${q(company)} AND created_at>=transaction_timestamp() AND subject_id IN (${ids});`);
const checks=jobs.map(j=>`IF NOT EXISTS (SELECT 1 FROM v_ordine_marginalita WHERE id=${q(j.id)} AND preventivo_totale=${j.expected.revenue} AND consuntivo=${j.expected.consuntivo} AND margine=${j.expected.margin}) THEN RAISE EXCEPTION 'Economic mismatch ${j.code}: %',(SELECT row_to_json(v) FROM v_ordine_marginalita v WHERE id=${q(j.id)}); END IF;`).join('\n');
rows.push(`DO $$ BEGIN ${checks} IF (SELECT quantity FROM warehouse_stock WHERE id=${q(stock)})<>55 THEN RAISE EXCEPTION 'Stock conservation failed'; END IF; END $$;`);
const sql=`BEGIN;\n${auth}\n${guard}\n${rows.join('\n')}\n`;
writeFileSync(`${out}/seed.sql`,sql+'COMMIT;');
writeFileSync(`${out}/dry-run.sql`,sql+'ROLLBACK;');
writeFileSync(`${out}/manifest.json`,JSON.stringify({company,marker,records,jobs},null,2));
const command=process.argv[2]??'prepare';
if(command==='seed'||command==='dry-run') {
 execFileSync('supabase',['db','query','--linked','-o','json','--file',`${out}/${command}.sql`],{stdio:'inherit',maxBuffer:20*1024*1024});
} else if(command==='verify') {
 const actual=query(`SELECT v.*, (SELECT count(*) FROM campo_rapportini r WHERE r.order_id=v.id) reports, (SELECT coalesce(sum(hours_worked),0) FROM order_employees e WHERE e.order_id=v.id) hours FROM v_ordine_marginalita v WHERE id IN (${jobs.map(j=>q(j.id)).join(',')});`);
 for(const j of jobs) {const a=actual.find(x=>x.id===j.id);if(!a||Number(a.consuntivo)!==j.expected.consuntivo||Number(a.margine)!==j.expected.margin||Number(a.hours)!==j.expected.hours)throw new Error(`Verification failed: ${j.code} ${JSON.stringify(a)}`);}
 const orderIds=jobs.map(j=>q(j.id)).join(',');
 const inventory=query(`SELECT
   (SELECT quantity FROM warehouse_stock WHERE id=${q(stock)}) stock_remaining,
   (SELECT count(*) FROM order_work_phases WHERE order_id IN (${orderIds})) phases,
   (SELECT count(*) FROM campo_rapportini WHERE order_id IN (${orderIds})) reports,
   (SELECT count(*) FROM foto_cantiere WHERE order_id IN (${orderIds})) photos,
   (SELECT count(*) FROM mezzi_assegnazioni WHERE order_id IN (${orderIds})) vehicle_assignments,
   (SELECT count(*) FROM order_installments WHERE order_id IN (${orderIds})) client_installments,
   (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('foto-cantiere','campo-rapportini') AND (${jobs.map(j=>`name LIKE ${q(company+'/'+j.id+'/demo-cfo-%')}`).join(' OR ')})) stored_images,
   (SELECT bool_and(NOT public) FROM storage.buckets WHERE id IN ('foto-cantiere','campo-rapportini')) private_buckets;`)[0];
 for(const [key,value] of Object.entries({stock_remaining:55,phases:24,reports:90,photos:9,vehicle_assignments:6,client_installments:9,stored_images:18}))if(Number(inventory[key])!==value)throw new Error(`Inventory mismatch ${key}: ${inventory[key]}`);
 if(!inventory.private_buckets)throw new Error('Photo buckets must remain private');
 writeFileSync(`${out}/inventory-audit.json`,JSON.stringify(inventory,null,2));console.log(inventory);
 writeFileSync(`${out}/verified.json`,JSON.stringify({verifiedAt:new Date().toISOString(),actual},null,2));console.log(JSON.stringify(actual,null,2));
} else if(command==='photos') {
 for(const j of jobs) for(const [i,stage] of ['prima','lavori','finale'].entries()) {
  const original=`/Users/agenteai/.codex/generated_images/01a0c971-7f8c-79f3-b076-73f23be195be/exec-${images[j.key][i]}.png`;
  const target=`${out}/${j.key}-${stage}.jpg`;
  if(!existsSync(target))execFileSync('sips',['-s','format','jpeg','-s','formatOptions','75','-Z','1400',original,'--out',target]);
  for(const bucket of ['foto-cantiere','campo-rapportini'])execFileSync('supabase',['storage','cp',target,`ss:///${bucket}/${company}/${j.id}/demo-cfo-${stage}.jpg`,'--experimental','--linked','--content-type','image/jpeg'],{stdio:'inherit'});
 }
} else if(command!=='prepare')throw new Error('Unknown command');
console.log(jobs.map(j=>({code:j.code,id:j.id,...j.expected})));
