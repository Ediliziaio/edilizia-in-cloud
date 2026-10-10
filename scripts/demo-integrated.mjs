/** Demo Azienda 2 only. Inspect -> snapshot -> prepare -> dry-run -> apply -> verify.
 * No fiscal submission, messages, credentials, forged signatures or certifications.
 * Artifacts are private and ignored; source is safe to commit.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const COMPANY='d2000000-0000-4000-a000-000000000002';
const ACTOR='e592255e-0c82-86cd-7f7b-d3046317f9cd';
const MARK='[DEMO INTEGRATA 2026-10 v1]';
const OUT='tmp/demo-integrated';
mkdirSync(OUT,{recursive:true,mode:0o700});
const quote=v=>v==null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const json=v=>quote(JSON.stringify(v))+'::jsonb';
const uid=key=>{const h=createHash('sha256').update(MARK+':'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const norm=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('it');
const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const TODAY='2026-10-09';
const localTimestamp=(date,time)=>{
  const z=new Intl.DateTimeFormat('en',{timeZone:'Europe/Rome',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;
  return date+'T'+time+(z==='GMT+2'?'+02:00':'+01:00');
};
function query(sql){try{return JSON.parse(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8',maxBuffer:80*1024*1024,stdio:['ignore','pipe','pipe']})).rows;}catch(e){throw Error(String(e.stderr).slice(0,1200));}}
function save(name,data){writeFileSync(`${OUT}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600});}
const scopes={
  orders:`company_id=${quote(COMPANY)}`,
  profiles:`company_id=${quote(COMPANY)}`,
  marketing_contacts:`company_id=${quote(COMPANY)}`,
};
const direct=['suppliers','employees','hr_profili','hr_timbrature','campo_timbrature','campo_rapportini','purchase_orders','purchase_order_items','ddt_ricezione','fatture_ricevute','invoices','invoice_payments','order_work_phases','order_work_subphases','order_acceptance_reports','company_costs','subappaltatori','subappaltatori_sicurezza','contratti_subappalto','sal_subappaltatori','external_teams','mezzi','mezzi_assegnazioni','mezzi_giornate','warehouse_stock','warehouse_movements','warehouse_uscite','warehouses','sal_records','foto_cantiere','order_statuses','ordini_variazione','order_errors','order_attachments'];
for(const t of direct) scopes[t]=`company_id=${quote(COMPANY)}`;
for(const t of ['order_items','order_installments','order_employees','order_external_teams']) scopes[t]=`order_id in (select id from orders where company_id=${quote(COMPANY)})`;
scopes.invoice_lines=`invoice_id in (select id from invoices where company_id=${quote(COMPANY)})`;
scopes.order_work_subphases=`phase_id in (select id from order_work_phases where company_id=${quote(COMPANY)})`;
scopes.order_attachments=`order_id in (select id from orders where company_id=${quote(COMPANY)})`;
scopes.v_ordine_marginalita=`company_id=${quote(COMPANY)}`;
scopes.hr_giornate=`company_id=${quote(COMPANY)}`;
scopes.order_document_folders=`company_id=${quote(COMPANY)}`;
for(const t of ['documenti_fiscali','anagrafiche_native','movimenti_cassa_native','prima_nota_entries','scadenze','fattura_ordine'])scopes[t]=`company_id=${quote(COMPANY)}`;
function guard(){
  const g=query(`select (select name from companies where id=${quote(COMPANY)}) name,
    (select count(*) from internal_automation_flows where company_id=${quote(COMPANY)} and status='published') flows,
    (select count(*) from automations where company_id=${quote(COMPANY)} and is_active) automations,
    (select count(*) from external_teams where company_id=${quote(COMPANY)} and google_sync_enabled and google_calendar_id is not null)+(select count(*) from company_calendar_links where company_id=${quote(COMPANY)} and enabled and google_calendar_id is not null) google`)[0];
  if(g.name!=='Demo Azienda 2 S.r.l.'||Number(g.flows)||Number(g.automations)||Number(g.google))throw Error('Tenant/outbound preflight failed');
}
function snapshot(name){
  if(name==='before'&&existsSync(`${OUT}/before.json`))throw Error('Original recovery snapshot already exists; do not overwrite it');
  guard();const data={at:new Date().toISOString(),company:COMPANY,marker:MARK};
  const rows=query(Object.entries(scopes).map(([t,scope])=>`select ${quote(t)} as tab,coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) as data from public.${t} t where ${scope}`).join(' UNION ALL '));
  for(const r of rows)data[r.tab]=r.data;
  save(name,data);console.log({snapshot:name,counts:Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))});return data;
}
async function customers(){
  guard();if(!existsSync(`${OUT}/before.json`))throw Error('Snapshot required');
  // Same anagrafica-only workflow as create-customer: private random credential,
  // Auth account banned from its creation, profile blocked, customer role, no invite.
  // Management credentials stay only in memory: never log or persist API keys.
  const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','rsbrguhkodgnqfomrevo','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;
  if(!key)throw Error('No authorized admin API key');
  const admin=createClient('https://rsbrguhkodgnqfomrevo.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
  const orders=query(`select id,client_name,client_address from orders where ${scopes.orders} and deleted_at is null and total_amount>0`);
  const profiles=query(`select id,first_name,last_name,business_name from profiles where ${scopes.profiles}`);
  const results=[];
  for(const o of orders){
    const name=norm(o.client_name);if(!name)throw Error('Missing demo customer identity');
    let candidates=profiles.filter(p=>norm(p.first_name+' '+p.last_name)===name||norm(p.business_name)===name);
    if(candidates.length>1)throw Error('Ambiguous customer: '+o.client_name);
    if(!candidates.length){
      const email=`cliente-${uid('customer-'+name)}@demo-integrata.invalid`;
      const tokens=o.client_name.trim().split(/\s+/);const first_name=tokens.shift();const last_name=tokens.join(' ')||'DEMO';
      const {data,error}=await admin.auth.admin.createUser({email,password:crypto.randomUUID()+crypto.randomUUID(),email_confirm:true,ban_duration:'876000h',user_metadata:{first_name,last_name,demo_company_id:COMPANY,demo_marker:MARK}});
      if(error)throw Error('Demo customer Auth failed: '+error.message);
      const id=data.user.id;
      const {error:pe}=await admin.from('profiles').insert({id,company_id:COMPANY,first_name,last_name,email,notes:MARK+' Persona fittizia, nessun accesso né invito.',portal_disabled:true,is_blocked:true,preferred_briefing_channel:'none',winback_opt_out:true});
      if(pe){await admin.auth.admin.deleteUser(id);throw Error('Demo profile failed: '+pe.message);}
      const {error:re}=await admin.from('user_roles').insert({user_id:id,role:'customer'});
      if(re)throw Error('Demo customer role failed: '+re.message);
      candidates=[{id,first_name,last_name}];profiles.push(candidates[0]);results.push({id,name:o.client_name,created:true});
    }
  }
  save('customers-created',results);console.log({customersCreated:results.length,noInvites:true,portalBlocked:true});
}
function prepare(){
  if(existsSync(`${OUT}/applied.json`))throw Error('Stage already applied; audit before creating another plan');
  const d=snapshot('prepare-state');const batches=[];const changes=[];
  const insert=(a,table,key,data,raw={})=>{
    const id=uid(key);const v={id,...data};a.push(`insert into public.${table}(${[...Object.keys(v),...Object.keys(raw)].join(',')}) values (${[...Object.values(v).map(quote),...Object.values(raw)].join(',')}) on conflict(id) do nothing;`);changes.push({table,id});return id;
  };
  const by=(t,key,id)=>d[t].filter(x=>x[key]===id);
  const general=[];
  const supplier=insert(general,'suppliers','supplier',{company_id:COMPANY,name:'DEMO · Forniture integrate',email:'forniture@demo-integrata.invalid',notes:MARK+' Fornitore fittizio. Non contattare.'});
  const warehouse=d.warehouses.find(w=>w.id==='8c09c96e-b6a6-c0d6-e2a5-ee93051b4a59')?.id;
  if(!warehouse)throw Error('Tenant warehouse missing');
  batches.push({key:'00-resources',order:null,statements:general});
  const profiles=d.profiles;
  for(const o of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0)){
    const a=[];const code=o.order_code||'DEMO-'+o.id.slice(0,8).toUpperCase();
    const customers=profiles.filter(p=>norm(p.first_name+' '+p.last_name)===norm(o.client_name)||p.business_name&&norm(p.business_name)===norm(o.client_name));
    if(customers.length!==1)throw Error('Customer missing/ambiguous: '+o.client_name);
    const customer=customers[0];
    const contactMatches=d.marketing_contacts.filter(c=>c.customer_profile_id===customer.id||norm(c.first_name+' '+(c.last_name??''))===norm(o.client_name));
    let contact=contactMatches.find(c=>c.customer_profile_id===customer.id)||contactMatches[0];
    if(!contact){const contactId=insert(a,'marketing_contacts','contact-'+customer.id,{company_id:COMPANY,first_name:customer.first_name,last_name:customer.last_name,email:`contatto-${customer.id}@demo-integrata.invalid`,customer_profile_id:customer.id,contact_type:'customer',source:'demo',source_channel:'manual',notes:MARK,preferred_channel:'email',optout_whatsapp:true,optout_email:true,optout_sms:true,optout_call:true,opt_out:true,unsubscribed:true,marketing_consent:false});contact={id:contactId};d.marketing_contacts.push(contact);}
    a.push(`update profiles set marketing_contact_id=${quote(contact.id)} where id=${quote(customer.id)} and company_id=${quote(COMPANY)} and marketing_contact_id is null;`);
    a.push(`update marketing_contacts set customer_profile_id=${quote(customer.id)} where id=${quote(contact.id)} and company_id=${quote(COMPANY)} and customer_profile_id is null;`);
    const created=o.created_at.slice(0,10);const start=o.work_start_date||addDays(created,14);const end=o.work_end_date||addDays(start,59);
    const progress=Math.max(0,Math.min(100,Number(o.percentuale_avanzamento)||0));
    const scope=(o.description||'')+' '+(o.work_description||'')+' '+(o.tipo_lavoro||'');
    const windows=/serrament|infissi|finestre|porte|persiane/i.test(scope)&&!/ristrutturazione|bagni e cucina|completa/i.test(scope);
    a.push(`update orders set customer_id=${quote(customer.id)},order_code=coalesce(order_code,${quote(code)}),work_start_date=coalesce(work_start_date,${quote(start)}),work_end_date=coalesce(work_end_date,${quote(end)}),weekly_report_enabled=false,giornale_auto_enabled=false,dl_notification_email=null,dl_notification_phone=null,
      internal_notes=case when coalesce(internal_notes,'') not like '%${MARK}%' then concat_ws(E'\\n',internal_notes,${quote(MARK+' Dati fittizi. Nessun invio fiscale, firma o comunicazione reale. Date mancanti pianificate dalla data di creazione; costi netti, rate IVA inclusa.')}) else internal_notes end,
      next_action=coalesce(next_action,${quote(progress===100?'DEMO · Verificare consegna, collaudo e saldo':end<TODAY?'DEMO · Riprogrammare cantiere in ritardo':'DEMO · Confermare squadra e materiali')}),next_action_date=coalesce(next_action_date,'2026-10-12'),destination_warehouse_id=coalesce(destination_warehouse_id,${quote(warehouse)})
      where id=${quote(o.id)} and company_id=${quote(COMPANY)};`);
    let phases=by('order_work_phases','order_id',o.id).sort((x,y)=>x.position-y.position);
    if(!phases.length){
      const labels=windows?['Rilievo e conferma misure','Preparazione e consegna materiali','Rimozione e posa serramenti','Regolazioni, verifica e consegna']:['Allestimento e demolizioni','Opere murarie','Impianti e predisposizioni','Massetti e impermeabilizzazione','Pavimenti e rivestimenti','Serramenti e dotazioni','Tinteggiature','Finiture e consegna'];
      const span=Math.max(1,Math.round((Date.parse(end)-Date.parse(start))/86400000));
      phases=labels.map((name,i)=>{
        const pct=Math.round(Math.min(100,Math.max(0,progress*labels.length-i*100)));
        const p={company_id:COMPANY,order_id:o.id,name,position:i,status:pct===100?'completata':pct?'in_corso':'da_iniziare',percentuale:pct,start_date:addDays(start,Math.floor(i*span/labels.length)),end_date:i===labels.length-1?end:addDays(start,Math.floor((i+1)*span/labels.length)),notes:MARK};
        p.id=insert(a,'order_work_phases','phase-'+o.id+'-'+i,p);return p;
      });
    }
    // Do not invent completed activities for planned works. Checklist derives phase status.
    for(const p of phases){
      if(!by('order_work_subphases','phase_id',p.id).length){
        ['Preparazione e verifica preliminare','Esecuzione e verifica finale'].forEach((name,i)=>insert(a,'order_work_subphases','subphase-'+p.id+'-'+i,{phase_id:p.id,name,position:i,peso:1,fatta:Number(p.percentuale)>=100,fatta_il:Number(p.percentuale)>=100?(p.end_date||end)+'T16:00:00+02:00':null}));
      }
    }
    let items=by('order_items','order_id',o.id);
    if(!items.length){
      const goods=windows?[['Finestra PVC completa',4],['Portafinestra PVC',2],['Accessori e materiali di posa',1]]:/fotovolta/i.test(scope)?[['Moduli fotovoltaici',12],['Inverter e protezioni',1],['Strutture e cavi',1]]:/bagno|doccia/i.test(scope)?[['Gres porcellanato e rivestimenti',40],['Sanitari e mobile lavabo',1],['Doccia e rubinetteria',1]]:[['Materiali murari e finiture',1],['Componenti impiantistici',1],['Dotazioni e accessori',1]];
      const poBudget=by('purchase_orders','order_id',o.id).reduce((s,p)=>s+Number(p.subtotal),0)||money(Number(o.total_amount)*.38);
      items=goods.map(([name,quantity],i)=>{
        const cost=money(poBudget/(goods.length*quantity));const p={order_id:o.id,name:'DEMO · '+name,description:MARK,quantity,purchase_price:cost,unit_price:money(cost*1.4),supplier_id:supplier,position:i,phase_id:phases[Math.min(i+1,phases.length-1)].id,status:progress===100?'installato':progress?'in_magazzino':'da_ordinare',fulfillment_status:progress===100?'installed':progress?'delivered':'not_started',quantity_received:progress?quantity:0,vat_rate:22};
        p.id=insert(a,'order_items','item-'+o.id+'-'+i,p);return p;
      });
    }
    for(const i of items.filter(i=>!i.phase_id))a.push(`update order_items set phase_id=${quote(phases[Math.min(1,phases.length-1)].id)} where id=${quote(i.id)} and order_id=${quote(o.id)} and phase_id is null;`);
    let pos=by('purchase_orders','order_id',o.id);
    if(!pos.length){
      const amount=money(items.filter(i=>!i.stock_item_id).reduce((s,i)=>s+Number(i.quantity)*Number(i.purchase_price),0))||money(Number(o.total_amount)*.38);
      const p={company_id:COMPANY,order_id:o.id,supplier_id:supplier,oda_number:'ODA-DEMO-'+o.id.slice(0,8),status:progress?'ricevuto':'bozza',issue_date:addDays(start,-7),expected_delivery_date:start,actual_delivery_date:progress?start:null,subtotal:amount,vat_total:money(amount*.22),total:money(amount*1.22),notes:MARK,delivery_address:o.work_address||o.indirizzo_lavori||'Cantiere dimostrativo',delivery_warehouse_id:warehouse,created_by:ACTOR,origine:'documento',payment_terms:'30 giorni'};
      p.id=insert(a,'purchase_orders','po-'+o.id,p);pos=[p];
      let running=0;
      items.filter(i=>!i.stock_item_id).forEach((item,k,list)=>{
        const net=k===list.length-1?money(amount-running):money(amount/list.length);running+=net;
        insert(a,'purchase_order_items','poi-'+p.id+'-'+item.id,{company_id:COMPANY,purchase_order_id:p.id,order_item_id:item.id,description:item.name,quantity:1,unit_price:net,vat_rate:22,quantity_received:progress?1:0,received_date:progress?start:null,sort_order:k});
      });
    }
    for(const po of pos){
      const poItems=by('purchase_order_items','purchase_order_id',po.id);
      if(!poItems.length&&!changes.some(c=>c.table==='purchase_order_items'&&a.some(sql=>sql.includes(c.id)&&sql.includes(po.id))))insert(a,'purchase_order_items','poi-summary-'+po.id,{company_id:COMPANY,purchase_order_id:po.id,description:'DEMO · '+(po.notes||o.description||'Fornitura materiali'),quantity:1,unit_price:Number(po.subtotal),vat_rate:Number(po.subtotal)?money(Number(po.vat_total)/Number(po.subtotal)*100):22,quantity_received:po.status==='ricevuto'?1:0,received_date:po.actual_delivery_date,sort_order:0});
      if(!by('ddt_ricezione','purchase_order_id',po.id).length){
        const received=po.status==='ricevuto';insert(a,'ddt_ricezione','ddt-'+po.id,{company_id:COMPANY,purchase_order_id:po.id,numero_ddt:'DDT-DEMO-'+po.id.slice(0,8),data_ricezione:po.actual_delivery_date||po.expected_delivery_date||start,quantita_ricevuta:received?(poItems.reduce((s,i)=>s+Number(i.quantity_received),0)||1):0,stato:received?'verificato':'atteso',source:'manual',warehouse_id:warehouse,note:MARK+' Documento sintetico, senza firma; nessun nuovo movimento di stock.',created_by:ACTOR,ricevuto_da_nome:received?'Magazziniere DEMO':null,has_damages:false});
      }
      if(po.status==='ricevuto'&&!by('fatture_ricevute','purchase_order_id',po.id).length){
        const s=d.suppliers.find(s=>s.id===po.supplier_id);let costs=by('company_costs','purchase_order_id',po.id);
        if(!costs.length){const c={company_id:COMPANY,order_id:o.id,purchase_order_id:po.id,supplier_id:po.supplier_id||supplier,name:'DEMO · Debito fornitore '+po.oda_number,cost_type:'variable',recurrence:'once',category:'materiali',amount:Number(po.subtotal),vat_rate:Number(po.subtotal)?money(Number(po.vat_total)/Number(po.subtotal)*100):22,due_date:addDays(po.actual_delivery_date||start,30),is_paid:false,notes:MARK+' Cash-flow ODA: escluso dai costi diretti per non duplicare acquisti.'};c.id=insert(a,'company_costs','cost-po-'+po.id,c);costs=[c];}
        insert(a,'fatture_ricevute','invoice-received-'+po.id,{company_id:COMPANY,purchase_order_id:po.id,company_cost_id:costs[0].id,order_id_suggerito:o.id,aggancio_oda_manuale:true,cedente_ragione_sociale:s?.name||'DEMO · Forniture integrate',cedente_paese:'IT',tipo_documento:'TD01',numero_fattura:'ACQ-DEMO-'+po.id.slice(0,8),data_fattura:po.actual_delivery_date||start,imponibile_totale:Number(po.subtotal),iva_totale:Number(po.vat_total),totale_documento:Number(po.total),stato:'letta',note:MARK+' Simulazione gestionale, non ricevuta da SDI. Costo già imputato dall’ODA.',ai_riassunto:'DEMO · Fattura collegata a ODA e commessa; nessun costo duplicato.'},{righe:json([{descrizione:'Fornitura '+po.oda_number,quantita:1,prezzo_unitario:Number(po.subtotal),importo:Number(po.subtotal)}]),riepilogo_iva:json([{imponibile:Number(po.subtotal),imposta:Number(po.vat_total)}])});
      }
    }
    let invoices=by('invoices','order_id',o.id).filter(i=>!i.deleted_at&&i.status!=='cancelled');
    let installments=by('order_installments','order_id',o.id).sort((x,y)=>x.position-y.position);
    const approved=by('ordini_variazione','order_id',o.id).filter(v=>v.status==='approvato').reduce((s,v)=>s+Number(v.impatto_economico),0);
    const gross=money((Number(o.total_amount)+approved)*(1+Number(o.vat_rate)/100));
    if(!installments.length){
      const rates=invoices.length?invoices.map(i=>({amount:Number(i.total),paid:Number(i.paid_amount)>=Number(i.total)-.01,date:i.payment_date,expected:i.due_date,invoice:i.id,label:i.notes||i.invoice_number})): [{amount:money(gross*.3),paid:false,expected:start,label:'Acconto DEMO'},{amount:money(gross-money(gross*.3)),paid:false,expected:addDays(end,15),label:'Saldo DEMO'}];
      installments=rates.map((r,i)=>{const p={order_id:o.id,position:i,label:r.label,type:i===rates.length-1?'balance':'deposit',amount:r.amount,is_paid:r.paid,paid_date:r.paid?(r.date||start):null,expected_date:r.expected,invoice_id:r.invoice||null};p.id=insert(a,'order_installments','rate-'+o.id+'-'+i,p);return p;});
    }else{
      const sum=money(installments.reduce((s,r)=>s+Number(r.amount),0));
      if(Math.abs(sum-(Number(o.total_amount)+approved))<.02&&Number(o.vat_rate)>0){let running=0;installments.forEach((r,i)=>{const amount=i===installments.length-1?money(gross-running):money(Number(r.amount)*(1+Number(o.vat_rate)/100));running+=amount;r.amount=amount;a.push(`update order_installments set amount=${amount} where id=${quote(r.id)} and order_id=${quote(o.id)};`);});}
    }
    if(!invoices.length){
      invoices=installments.map((r,i)=>{
        const total=Number(r.amount),net=money(total/(1+Number(o.vat_rate)/100)),tax=money(total-net);
        const issue=r.is_paid?(r.paid_date||start):i===0?start:end;const issued=r.is_paid||progress===100||i===0&&progress>0;
        const inv={company_id:COMPANY,order_id:o.id,client_id:contact.id,client_company_name:o.client_name,client_email:`fatture-${o.id}@demo-integrata.invalid`,invoice_number:'DEMO-'+code+'-'+(i+1),invoice_year:Number(issue.slice(0,4)),document_type:issued?'invoice':'proforma',status:'draft',issue_date:issue,due_date:r.expected_date||addDays(issue,30),subtotal:net,tax_amount:tax,total,paid_amount:0,payment_method:'bank_transfer',notes:MARK+' '+r.label+' · Documento dimostrativo non fiscale; nessun invio SDI.',created_by:ACTOR,order_match_origine:'manuale'};
        inv.id=insert(a,'invoices','invoice-'+r.id,inv);
        insert(a,'invoice_lines','line-'+inv.id,{invoice_id:inv.id,description:'DEMO · '+r.label+' — '+o.description,quantity:1,unit:'corpo',unit_price:net,tax_rate:Number(o.vat_rate),line_net:net,line_tax:tax,line_gross:total});
        a.push(`update order_installments set invoice_id=${quote(inv.id)} where id=${quote(r.id)} and order_id=${quote(o.id)} and invoice_id is null;`);
        if(issued)a.push(`update invoices set status='issued' where id=${quote(inv.id)} and company_id=${quote(COMPANY)} and status='draft';`);
        inv.fixturePaid=r.is_paid?total:0;inv.fixtureDate=r.paid_date||start;return inv;
      });
    }
    const matched=new Set();
    for(const r of installments){
      if(!r.invoice_id){const matches=invoices.filter(i=>!matched.has(i.id)&&Math.abs(Number(i.total)-Number(r.amount))<.02);if(matches.length===1){r.invoice_id=matches[0].id;matched.add(r.invoice_id);a.push(`update order_installments set invoice_id=${quote(r.invoice_id)} where id=${quote(r.id)} and order_id=${quote(o.id)} and invoice_id is null;`);}}
      if(r.is_paid&&!r.paid_date)a.push(`update order_installments set paid_date=${quote(invoices.find(i=>i.id===r.invoice_id)?.payment_date||start)} where id=${quote(r.id)} and order_id=${quote(o.id)} and is_paid and paid_date is null;`);
    }
    for(const i of invoices){
      a.push(`update invoices set client_id=${quote(contact.id)},notes=case when coalesce(notes,'') not like '%${MARK}%' then concat_ws(E'\\n',notes,${quote(MARK+' Documento fittizio, nessun invio SDI.')}) else notes end where id=${quote(i.id)} and company_id=${quote(COMPANY)};`);
      const paid=Number(i.fixturePaid??i.paid_amount),events=by('invoice_payments','invoice_id',i.id),recorded=events.reduce((s,p)=>s+Number(p.amount),0),delta=money(paid-recorded);
      if(delta>.01){const date=i.fixtureDate||i.payment_date||i.issue_date;insert(a,'invoice_payments','payment-'+i.id,{invoice_id:i.id,company_id:COMPANY,amount:delta,payment_date:date,payment_method:'bank_transfer',reference:'DEMO riconciliazione '+i.invoice_number,notes:MARK+' Riscontro dell’incasso già presente, non un secondo incasso.',created_by:ACTOR});}
    }
    if(progress===100&&!by('order_acceptance_reports','order_id',o.id).length){
      const content={date:end,title:'DEMO · Verifica e consegna '+code,customer:o.client_name,inspector:'Responsabile verifiche DEMO',scope:o.description||'Verifica delle lavorazioni',outcome:'positive',reservations:'',actions:[],documents:'Esempio manuali e istruzioni. Nessuna certificazione reale emessa.',notes:MARK+' Bozza dimostrativa non firmata. Non attesta lavori reali.',checks:['Lavorazioni previste e finiture','Funzionamento delle parti installate','Pulizia e ripristino degli ambienti','Documenti e istruzioni consegnati'].map(label=>({label,result:'ok',note:'Verifica sintetica dimostrativa, non reale.'}))};
      insert(a,'order_acceptance_reports','acceptance-'+o.id,{company_id:COMPANY,order_id:o.id,created_by:ACTOR,status:'draft'},{content:json(content)});
    }
    a.push(`update orders set fulfillment_status=${quote(progress===100?'completed':progress>0?'partial_installed':'not_started')},percentuale_avanzamento=${progress} where id=${quote(o.id)} and company_id=${quote(COMPANY)};`);
    batches.push({key:code,order:o.id,statements:a});
  }
  for(const b of batches){
    const ids=[b.order,...changes.filter(c=>b.statements.some(s=>s.includes(c.id))).map(c=>c.id)].filter(Boolean);
    const cleanup=`delete from automation_trigger_events where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and (entity_id in (${ids.map(quote).join(',')||"''"}) or ${ids.map(id=>`payload::text like ${quote('%'+id+'%')}`).join(' or ')||'false'});
      delete from wa_notifiche_event_queue where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and subject_id in (${ids.map(quote).join(',')||"''"});`;
    const invariant=b.order?.startsWith('1778464d')||['d1d16e2e-437a-42eb-a7a0-60c38c22dfbe','b20edd88-6b86-4024-af24-1b1b2a4b2674'].includes(b.order)?`if (select consuntivo from v_ordine_marginalita where id=${quote(b.order)}) is distinct from (select consuntivo from _demo_before) then raise exception 'CFO costs changed';end if;`:'';
    const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
      do $$ begin if not exists(select 1 from companies where id=${quote(COMPANY)} and name='Demo Azienda 2 S.r.l.') then raise exception 'Wrong tenant';end if; if exists(select 1 from internal_automation_flows where company_id=${quote(COMPANY)} and status='published') or exists(select 1 from automations where company_id=${quote(COMPANY)} and is_active) then raise exception 'Outbound automation enabled';end if;end $$;
      create temporary table _demo_before on commit drop as select * from v_ordine_marginalita where id=${quote(b.order)};
      ${b.order?general.join('\n'):''}
      ${b.statements.join('\n')}
      ${cleanup}
      do $$ begin ${invariant} if exists(select 1 from orders o join _demo_before p using(id) where o.company_id<>${quote(COMPANY)} or o.total_amount<>p.preventivo_contratto) then raise exception 'Tenant/contract changed';end if;end $$;
      select ${quote(b.key)} as batch;
      __END__;`;
    b.sql=sql;
  }
  save('plan',{company:COMPANY,marker:MARK,batches,changes});
  console.log({batches:batches.length,inserts:changes.length,byTable:changes.reduce((a,c)=>({...a,[c.table]:(a[c.table]||0)+1}),{}),stage:'Prepared only'});
}
function execute(commit){
  guard();const plan=JSON.parse(readFileSync(`${OUT}/plan.json`));if(plan.company!==COMPANY)throw Error('Wrong plan');
  const done=commit&&existsSync(`${OUT}/applied.json`)?JSON.parse(readFileSync(`${OUT}/applied.json`)).batches:[];
  for(const b of plan.batches){if(commit&&done.includes(b.key))continue;query(b.sql.replace('__END__',commit?'COMMIT':'ROLLBACK'));done.push(b.key);save(commit?'applied':'dry-run',{at:new Date().toISOString(),batches:done});console.log((commit?'APPLIED ':'DRY ')+b.key);}
}
function prepareOperations(){
  if(existsSync(`${OUT}/operations-applied.json`))throw Error('Stage already applied; preserve its original plan and snapshot');
  const d=snapshot('operations-before');const original=JSON.parse(readFileSync(`${OUT}/prepare-state.json`));
  const batches=[],changes=[];const by=(t,key,id)=>d[t].filter(x=>x[key]===id);
  const ins=(a,t,key,v,raw={})=>{const id=uid(key);a.push(`insert into public.${t}(id,${[...Object.keys(v),...Object.keys(raw)].join(',')}) values (${[id,...Object.values(v)].map(quote).join(',')}${Object.keys(raw).length?','+Object.values(raw).join(','):''}) on conflict(id) do nothing;`);changes.push({table:t,id});return id;};
  const resources=[];
  const crew=[0,1].map(i=>{
    const e={company_id:COMPANY,first_name:i?'Nadia':'Giacomo',last_name:'DEMO Integrata',email:`operaio-${i}@demo-integrata.invalid`,area:'cantiere',is_active:true,costo_orario:i?30:26,monthly_hours:168,role_type:'operaio'};
    e.id=ins(resources,'employees','operations-employee-'+i,e);
    const h={company_id:COMPANY,employee_id:e.id,nome:e.first_name,cognome:e.last_name,email:e.email,attivo:true,note:MARK+' Operaio fittizio senza account né credenziali.',ore_giornaliere:8,orario_tipo:'fisso',tipo_contratto:'indeterminato',lavora_in_cantiere:true};
    h.id=ins(resources,'hr_profili','operations-hr-'+i,h);d.hr_profili.push(h);d.employees.push(e);return e;
  });
  const occupied=new Set(d.hr_timbrature.map(t=>t.profilo_id+'|'+t.data_evento));
  const plannedReports=[];
  for(const o of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0)){
    const a=[];let delta=0;const progress=Number(o.percentuale_avanzamento);
    const phases=by('order_work_phases','order_id',o.id).sort((x,y)=>x.position-y.position);
    const oldPhases=original.order_work_phases.filter(p=>p.order_id===o.id);
    for(let i=0;i<phases.length;i++){
      const p=phases[i],old=oldPhases.find(x=>x.id===p.id),pct=old?Number(old.percentuale):Math.round(Math.min(100,Math.max(0,progress*phases.length-i*100)));
      p.target=pct;const subs=by('order_work_subphases','phase_id',p.id).sort((x,y)=>x.position-y.position);
      if(subs.length===2&&subs.every(s=>s.id===uid('subphase-'+p.id+'-'+s.position))){
        a.push(`update order_work_subphases set peso=${pct>0&&pct<100?pct:1},fatta=${pct>0},fatta_il=${quote(pct>0?(p.end_date||o.work_end_date)+'T16:00:00+02:00':null)} where id=${quote(subs[0].id)} and phase_id=${quote(p.id)};`);
        a.push(`update order_work_subphases set peso=${pct>0&&pct<100?100-pct:1},fatta=${pct===100},fatta_il=${quote(pct===100?(p.end_date||o.work_end_date)+'T16:00:00+02:00':null)} where id=${quote(subs[1].id)} and phase_id=${quote(p.id)};`);
      }
    }
    const ownReports=by('campo_rapportini','order_id',o.id);
    const ownInternal=by('order_employees','order_id',o.id);
    const ownExternal=by('order_external_teams','order_id',o.id);
    if(!ownInternal.length&&!ownExternal.length){
      const e=crew[0];ins(a,'order_employees','planned-employee-'+o.id,{order_id:o.id,employee_id:e.id,phase_id:phases[0].id,hours_worked:0,hourly_rate:Number(e.costo_orario),total_cost:0,cost_preventivo:money(Number(o.total_amount)*.12),notes:MARK+' Budget squadra interna; consuntivo solo dai rapportini approvati.'});
    }
    if(progress>0&&!ownReports.length){
      for(const p of phases.filter(p=>p.target>0)){
        let date=p.start_date||o.work_start_date;
        const limit=[p.end_date||o.work_end_date,TODAY].sort()[0];
        let chosen=null;
        while(date<=limit){
          if(![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))chosen=crew.find(e=>!occupied.has(d.hr_profili.find(h=>h.employee_id===e.id).id+'|'+date));
          if(chosen)break;date=addDays(date,1);
        }
        if(!chosen)continue;
        const e=chosen,h=d.hr_profili.find(h=>h.employee_id===e.id);occupied.add(h.id+'|'+date);
        const r={company_id:COMPANY,order_id:o.id,user_id:null,role_type:'employee',data_lavoro:date,ore_lavorate:8,descrizione_lavori:MARK+' '+p.name+'. Giornata campione dimostrativa: avanzamento e costo ricostruiti da presenza approvata.',stato:'inviato',source:'manual',approvato:false,note:'DEMO · Nessuna firma né geolocalizzazione reale.'};
        r.presenze=[{employee_id:e.id,nome:e.first_name+' '+e.last_name,ore:8}];r.fasi_lavorate=[{phase_id:p.id,ore:8}];
        const item=by('order_items','order_id',o.id).find(i=>i.phase_id===p.id)||by('order_items','order_id',o.id)[0];
        r.materiali_usati=item?[{nome:item.name,order_item_id:item.id,quantita:1,unita:'pz',da_furgone:false}]:[];
        r.id=ins(a,'campo_rapportini','sample-report-'+o.id+'-'+p.id,Object.fromEntries(Object.entries(r).filter(([k])=>!['presenze','fasi_lavorate','materiali_usati'].includes(k))),{presenze:json(r.presenze),fasi_lavorate:json(r.fasi_lavorate),materiali_usati:json(r.materiali_usati)});
        a.push(`update campo_rapportini set stato='approvato',approvato=true,approvato_da=${quote(ACTOR)},approvato_at=${quote(date+'T17:00:00+02:00')} where id=${quote(r.id)} and company_id=${quote(COMPANY)} and stato='inviato';`);
        ownReports.push(r);plannedReports.push(r);delta+=8*Number(e.costo_orario);
      }
    }
    for(const r of ownReports.filter(r=>r.data_lavoro<=TODAY)){
      // Explicit HR link also covers workers with no login. Campo's mirror must not
      // create another HR record. No artificial GPS or impersonated real users.
      for(const presence of r.presenze||[]){
        const e=d.employees.find(e=>e.id===presence.employee_id);if(!e||Number(presence.ore)!==8)continue;
        let h=d.hr_profili.find(h=>h.employee_id===e.id);if(!h)continue;
        const existing=by('hr_timbrature','profilo_id',h.id).filter(t=>t.data_evento===r.data_lavoro);
        if(existing.length)continue;
        for(const [tipo,time]of [['entrata','08:00:00'],['pausa_inizio','12:00:00'],['pausa_fine','13:00:00'],['uscita','17:00:00']]){
          const ts=localTimestamp(r.data_lavoro,time);
          const hrid=ins(a,'hr_timbrature','punch-'+r.id+'-'+e.id+'-'+tipo,{company_id:COMPANY,profilo_id:h.id,order_id:o.id,tipo,timestamp:ts,fonte:'manuale',validata:true,validata_da:ACTOR,note:MARK+' Timbratura sintetica collegata al rapportino '+r.id});
          ins(a,'campo_timbrature','campo-'+hrid,{company_id:COMPANY,user_id:null,order_id:o.id,tipo,timestamp_evento:ts,fonte:'manuale',hr_timbratura_id:hrid,note:MARK+' '+e.first_name+' '+e.last_name+' · collegamento HR, nessun secondo costo.'});
        }
      }
    }
    // Preserve subcontracting costs already entered. Add the missing contractual
    // chain, not another cost for the same team or SAL.
    for(const teamId of new Set(ownExternal.map(t=>t.external_team_id))){
      const assignments=ownExternal.filter(t=>t.external_team_id===teamId);const team=d.external_teams.find(t=>t.id===teamId);if(!team||team.subappaltatore_id)continue;
      const sub=ins(a,'subappaltatori','sub-'+teamId,{company_id:COMPANY,ragione_sociale:'DEMO · '+team.name,email:`sub-${teamId}@demo-integrata.invalid`,notes:MARK});
      a.push(`update external_teams set subappaltatore_id=${quote(sub)} where id=${quote(teamId)} and company_id=${quote(COMPANY)} and subappaltatore_id is null;`);
      const safety=ins(a,'subappaltatori_sicurezza','safety-'+o.id+'-'+teamId,{company_id:COMPANY,order_id:o.id,ragione_sociale:'DEMO · '+team.name,campo_subappaltatore_id:sub,data_inizio:o.work_start_date,data_fine:o.work_end_date,note:MARK+' Documenti di sicurezza reali non simulati.'});
      const cost=assignments.reduce((s,t)=>s+Number(t.total_cost),0),budget=assignments.reduce((s,t)=>s+Number(t.cost_preventivo??t.total_cost),0);
      const contract=ins(a,'contratti_subappalto','contract-'+o.id+'-'+teamId,{company_id:COMPANY,order_id:o.id,subappaltatore_id:safety,numero_contratto:'SUB-DEMO-'+o.id.slice(0,8)+'-'+teamId.slice(0,4),descrizione_lavori:team.name,importo_contrattuale:budget||cost,data_inizio:o.work_start_date,data_fine_prevista:o.work_end_date,stato:progress===100?'completato':progress?'attivo':'bozza',note:MARK+' Quota economica già nelle assegnazioni; non duplicare il costo.'});
      if(cost>0)ins(a,'sal_subappaltatori','sub-sal-'+contract,{company_id:COMPANY,order_id:o.id,contratto_id:contract,subappaltatore_id:safety,numero_sal:1,data_emissione:progress===100?o.work_end_date:[o.work_end_date,TODAY].sort()[0],importo_lordo:cost,ritenuta_pct:0,stato:assignments.every(t=>t.is_paid)?'pagato':'verificato',data_pagamento:assignments.every(t=>t.is_paid)?assignments.find(t=>t.paid_date)?.paid_date||o.work_end_date:null,note:MARK+' SAL di liquidazione, non secondo costo.'});
    }
    for(const ma of by('mezzi_assegnazioni','order_id',o.id)){
      const r=ownReports[0];if(!r)continue;
      ins(a,'mezzi_giornate','vehicle-day-'+ma.id,{company_id:COMPANY,mezzo_id:ma.mezzo_id,order_id:o.id,user_id:ACTOR,giorno:r.data_lavoro,usato:true,dove:'cantiere',rapportino_id:r.id});
    }
    // Native documents are the SAME commercial events as legacy invoices.
    // Canonical UUID + shared scadenza + payment linkage prevent a second claim.
    const invoices=by('invoices','order_id',o.id).filter(i=>!i.deleted_at&&i.status!=='cancelled');
    for(const inv of invoices){
      if(d.documenti_fiscali.some(f=>f.id===inv.id))continue;
      const nativeCustomer=ins(a,'anagrafiche_native','native-customer-'+o.customer_id,{company_id:COMPANY,tipo:'cliente',tipo_soggetto:'fisico',tipo_cliente:'B2C',ragione_sociale:o.client_name,nome:o.client_name,email:`cliente-${o.customer_id}@demo-integrata.invalid`,cliente_id:o.customer_id,sync_from_cliente:false,note:MARK+' Dati fittizi, non idonei a trasmissione SDI.'});
      const lines=by('invoice_lines','invoice_id',inv.id).map(l=>({descrizione:l.description,quantita:Number(l.quantity),prezzo_unitario:Number(l.unit_price),aliquota_iva:String(l.tax_rate),unita_misura:l.unit||'corpo',sconto_percentuale:Number(l.discount_percent||0),imponibile:Number(l.line_net),iva:Number(l.line_tax),totale:Number(l.line_gross)}));
      const issued=inv.status!=='draft',paid=Number(inv.paid_amount),scad=by('scadenze','invoice_id',inv.id).find(s=>s.status!=='annullata');
      if(scad)a.push(`update scadenze set notes=concat_ws(' ',notes,${quote('[DOC:'+inv.id+']')}),order_id=${quote(o.id)} where id=${quote(scad.id)} and company_id=${quote(COMPANY)} and coalesce(notes,'') not like ${quote('%[DOC:'+inv.id+']%')};`);
      const document={company_id:COMPANY,tipo:inv.document_type==='proforma'?'proforma':'fattura',numero:'DEMO-'+inv.invoice_number,numero_progressivo:10000+d.invoices.findIndex(i=>i.id===inv.id),anno:inv.invoice_year,serie:'DEMO',data_emissione:inv.issue_date,data_scadenza:inv.due_date,anagrafica_id:nativeCustomer,ordine_id:o.id,stato:issued?'emessa':'bozza',trasmissione:'manuale',subtotale:Number(inv.subtotal),imponibile_totale:Number(inv.subtotal),iva_totale:Number(inv.tax_amount),totale_documento:Number(inv.total),totale_da_pagare:Number(inv.total),importo_pagato:0,note_documento:'DEMO — NON VALIDO AI FINI FISCALI. Documento sintetico, mai trasmesso a SDI.',note_interne:MARK+' Stesso evento della fattura legacy '+inv.id+'; non un secondo ricavo.',codice_commessa_convenzione:o.order_code};
      const keys=[...Object.keys(document),'cliente_snapshot','righe','riepilogo_iva','scadenze_pagamento'];
      a.push(`insert into documenti_fiscali(id,${keys.join(',')}) values (${[inv.id,...Object.values(document)].map(quote).join(',')},${json({ragione_sociale:o.client_name,nome:o.client_name,tipo_cliente:'B2C',email:`cliente-${o.customer_id}@demo-integrata.invalid`,indirizzo_nazione:'IT'})},${json(lines)},${json([{aliquota_iva:String(o.vat_rate),imponibile:Number(inv.subtotal),imposta:Number(inv.tax_amount)}])},${json([{data_scadenza:inv.due_date,importo:Number(inv.total),metodo:'MP05'}])}) on conflict(id) do nothing;`);changes.push({table:'documenti_fiscali',id:inv.id});
      ins(a,'fattura_ordine','native-link-'+inv.id,{company_id:COMPANY,fattura_id:inv.id,ordine_id:o.id,importo_associato:Number(inv.total),note:MARK,created_by:ACTOR});
      if(paid>0){
        const previous=by('prima_nota_entries','invoice_id',inv.id).filter(p=>p.direction==='entrata');const previousAmount=previous.reduce((s,p)=>s+Number(p.amount),0);
        if(previousAmount>0&&Math.abs(previousAmount-paid)>.02)throw Error('Existing cash ledger mismatch '+inv.invoice_number);
        if(previousAmount>0){
          const mov=ins(a,'movimenti_cassa_native','native-cash-'+inv.id,{company_id:COMPANY,documento_id:inv.id,tipo:'incasso',data_movimento:inv.payment_date||inv.issue_date,importo:paid,metodo:'MP05',riferimento:'DEMO · '+inv.invoice_number,note:MARK+' Specchio incasso esistente; nessuna nuova prima nota.'});
          a.push(`update prima_nota_entries set documento_fiscale_id=${quote(inv.id)},movimento_id=${quote(mov)},order_id=${quote(o.id)} where company_id=${quote(COMPANY)} and invoice_id=${quote(inv.id)} and direction='entrata';`);
        }else{
          a.push(`select registra_incasso_atomico(${quote(COMPANY)},${quote(inv.id)},${paid},'MP05',${quote(inv.payment_date||inv.issue_date)},${quote('DEMO · '+inv.invoice_number)},${quote(MARK+' Riscontro unico incasso legacy, non secondo pagamento.')});`);
          a.push(`update prima_nota_entries set invoice_id=${quote(inv.id)},order_id=${quote(o.id)} where company_id=${quote(COMPANY)} and documento_fiscale_id=${quote(inv.id)};`);
        }
        a.push(`update documenti_fiscali set pagato_at=${quote((inv.payment_date||inv.issue_date)+'T12:00:00+02:00')} where id=${quote(inv.id)} and company_id=${quote(COMPANY)} and stato='pagata';`);
      }
      a.push(`update order_installments set documento_fiscale_id=${quote(inv.id)} where order_id=${quote(o.id)} and invoice_id=${quote(inv.id)} and documento_fiscale_id is null;`);
    }
    a.push(`update orders set percentuale_avanzamento=${progress} where id=${quote(o.id)} and company_id=${quote(COMPANY)};`);
    batches.push({key:o.order_code,order:o.id,delta,statements:a});
  }
  const resourceBatch={key:'00-operations-resources',order:null,delta:0,statements:resources};batches.unshift(resourceBatch);
  for(const b of batches){
    const ids=[b.order,...changes.filter(c=>b.statements.some(s=>s.includes(c.id))).map(c=>c.id)].filter(Boolean);
    b.sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
      do $$ begin if not exists(select 1 from companies where id=${quote(COMPANY)} and name='Demo Azienda 2 S.r.l.') or exists(select 1 from internal_automation_flows where company_id=${quote(COMPANY)} and status='published') or exists(select 1 from automations where company_id=${quote(COMPANY)} and is_active) then raise exception 'Unsafe demo preflight';end if;end $$;
      create temporary table _demo_before on commit drop as select consuntivo from v_ordine_marginalita where id=${quote(b.order)};
      ${b.order?resources.join('\n'):''}
      ${b.statements.join('\n')}
      delete from automation_trigger_events where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and (${ids.map(id=>`entity_id=${quote(id)} or payload::text like ${quote('%'+id+'%')}`).join(' or ')||'false'});
      delete from wa_notifiche_event_queue where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and subject_id in (${ids.map(quote).join(',')||"''"});
      do $$ begin if (select consuntivo from v_ordine_marginalita where id=${quote(b.order)}) is distinct from (select consuntivo+${b.delta} from _demo_before) then raise exception 'Unexpected operational cost delta';end if;end $$;
      select ${quote(b.key)} as batch;__END__;`;
  }
  save('operations-plan',{company:COMPANY,marker:MARK,batches,changes});save('operations-samples',plannedReports);
  console.log({batches:batches.length,records:changes.length,reports:plannedReports.length,byTable:changes.reduce((a,c)=>({...a,[c.table]:(a[c.table]||0)+1}),{})});
}
function executeOperations(commit,stage='operations'){
  guard();const content=readFileSync(`${OUT}/${stage}-plan.json`,'utf8'),plan=JSON.parse(content);if(plan.company!==COMPANY)throw Error('Wrong tenant');
  const hash=createHash('sha256').update(content).digest('hex');const record=commit?`${stage}-applied`:`${stage}-dry-run`;
  const previous=commit&&existsSync(`${OUT}/${record}.json`)?JSON.parse(readFileSync(`${OUT}/${record}.json`)):null;
  if(previous&&previous.hash!==hash)throw Error('Existing execution has another plan: audit before resuming');
  const done=previous?.batches||[];
  for(const b of plan.batches){if(commit&&done.includes(b.key))continue;query(b.sql.replace('__END__',commit?'COMMIT':'ROLLBACK'));done.push(b.key);save(record,{at:new Date().toISOString(),hash,company:COMPANY,batches:done});console.log((commit?'APPLIED ':'DRY ')+b.key);}
}
function prepareFinances(){
  if(existsSync(`${OUT}/finances-applied.json`))throw Error('Stage already applied; preserve its original plan and snapshot');
  const d=snapshot('finances-before'),batches=[],removed=[];
  const by=(t,k,id)=>d[t].filter(x=>x[k]===id);
  for(const o of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0)){
    const a=[],rates=by('order_installments','order_id',o.id).sort((x,y)=>x.position-y.position);
    const invoices=by('invoices','order_id',o.id).filter(i=>!i.deleted_at&&i.status!=='cancelled').sort((x,y)=>x.issue_date.localeCompare(y.issue_date)||Number(x.total)-Number(y.total));
    const gross=money((Number(o.total_amount)+by('ordini_variazione','order_id',o.id).filter(v=>v.status==='approvato').reduce((s,v)=>s+Number(v.impatto_economico),0))*(1+Number(o.vat_rate)/100));
    const billed=money(invoices.reduce((s,i)=>s+Number(i.total),0));
    if(billed>gross+.02)throw Error('Overbilled demo contract '+o.order_code);
    // Explicitly unlink first: an old paid flag must never turn a linkage repair
    // into a new incasso. Native invoices are the authoritative cash ledger.
    a.push(`update order_installments set documento_fiscale_id=null,invoice_id=null where order_id=${quote(o.id)};`);
    for(const inv of invoices){
      const doc=d.documenti_fiscali.find(f=>f.id===inv.id);if(!doc)throw Error('Native mirror absent');
      const excess=money(Number(doc.importo_pagato)-Number(inv.paid_amount));
      if(excess>.01){
        const accidental=by('movimenti_cassa_native','documento_id',inv.id).filter(m=>m.tipo==='incasso'&&rates.some(r=>m.note===`[RATA:${r.id}]`));
        if(Math.abs(accidental.reduce((s,m)=>s+Number(m.importo),0)-excess)>.02)throw Error('Non-fixture cash mismatch '+o.order_code);
        for(const m of accidental)a.push(`select storna_incasso_atomico(${quote(COMPANY)},${quote(m.id)});`);
      }else if(excess<-.01)throw Error('Native cash below legacy '+o.order_code);
    }
    const needed=invoices.length+(gross-billed>.02?Math.max(1,rates.length-invoices.length):0);
    const available=[...rates],selected=[];
    for(let i=0;i<needed;i++){
      const inv=invoices[i];let r=inv?available.find(r=>r.invoice_id===inv.id):null;r??=available[0];
      if(r)available.splice(available.indexOf(r),1);
      else {r={id:uid('reconciled-rate-'+o.id+'-'+i)};a.push(`insert into order_installments(id,order_id,position,label,type,amount,is_paid) values (${quote(r.id)},${quote(o.id)},${i},'DEMO · Saldo da fatturare','balance',0,false) on conflict(id) do nothing;`);}
      selected.push(r);
    }
    let remainder=money(gross-billed);
    for(let i=0;i<selected.length;i++){
      const inv=invoices[i],r=selected[i],isPaid=!!inv&&Number(inv.paid_amount)>=Number(inv.total)-.01;
      const amount=inv?Number(inv.total):i===selected.length-1?remainder:money(remainder/(selected.length-i));
      if(!inv)remainder=money(remainder-amount);
      const label=inv?`DEMO · ${i===0?'Acconto':'Saldo'} · ${inv.invoice_number}`:'DEMO · Quota saldo ancora da fatturare';
      a.push(`update order_installments set position=${i},label=${quote(label)},type=${quote(i===selected.length-1?'balance':'deposit')},amount=${amount},is_paid=${isPaid},paid_date=${quote(isPaid?(inv.payment_date||inv.issue_date):null)},expected_date=${quote(inv?.due_date||addDays(o.work_end_date,15))},invoice_id=${quote(inv?.id)},documento_fiscale_id=${quote(inv?.id)} where id=${quote(r.id)} and order_id=${quote(o.id)};`);
    }
    for(const r of available){
      if(o.order_code?.startsWith('DEMO-CFO-'))throw Error('Never replace the CFO payment plan');
      removed.push({order:o.id,rate:r});
      a.push(`do $$ begin if exists(select 1 from prima_nota_entries where installment_id=${quote(r.id)}) or exists(select 1 from bank_transactions where linked_installment_id=${quote(r.id)}) or exists(select 1 from sal_records where installment_id=${quote(r.id)}) then raise exception 'Protected old installment';end if;end $$; delete from order_installments where id=${quote(r.id)} and order_id=${quote(o.id)} and documento_fiscale_id is null and invoice_id is null;`);
    }
    // No costs or actual invoice payments may change during reconciliation.
    const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
      do $$ begin if not exists(select 1 from orders where id=${quote(o.id)} and company_id=${quote(COMPANY)}) or exists(select 1 from internal_automation_flows where company_id=${quote(COMPANY)} and status='published') or exists(select 1 from automations where company_id=${quote(COMPANY)} and is_active) then raise exception 'Unsafe demo preflight';end if;end $$;
      create temporary table _demo_before on commit drop as select consuntivo from v_ordine_marginalita where id=${quote(o.id)};
      ${a.join('\n')}
      do $$ begin if abs((select sum(amount) from order_installments where order_id=${quote(o.id)})-${gross})>.02 then raise exception 'Installment total mismatch';end if;
      if exists(select 1 from invoices i join documenti_fiscali f on f.id=i.id where i.order_id=${quote(o.id)} and abs(i.paid_amount-f.importo_pagato)>.02) then raise exception 'Cash reconciliation mismatch';end if;
      if (select consuntivo from v_ordine_marginalita where id=${quote(o.id)}) is distinct from (select consuntivo from _demo_before) then raise exception 'Costs changed';end if;end $$;
      delete from automation_trigger_events where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and (entity_id=${quote(o.id)} or payload::text like ${quote('%'+o.id+'%')});
      delete from wa_notifiche_event_queue where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and subject_id=${quote(o.id)};
      select ${quote(o.order_code)} as batch;__END__;`;
    batches.push({key:o.order_code,order:o.id,sql});
  }
  save('finances-plan',{company:COMPANY,marker:MARK,batches,removed});
  console.log({batches:batches.length,supersededInstallments:removed.length,archivedInPrivateSnapshot:true});
}
function prepareCompletion(){
  if(existsSync(`${OUT}/completion-applied.json`))throw Error('Stage already applied; preserve its original plan and snapshot');
  const d=snapshot('completion-before'),a=[],by=(t,k,id)=>d[t].filter(x=>x[k]===id);let expectedDelta=0;const costByOrder={};
  const ins=(t,key,v,raw={})=>{const id=uid(key);a.push(`insert into ${t}(id,${[...Object.keys(v),...Object.keys(raw)].join(',')}) values (${[id,...Object.values(v)].map(quote).join(',')}${Object.keys(raw).length?','+Object.values(raw).join(','):''}) on conflict(id) do nothing;`);return id;};
  for(const o of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0)){
    const phases=by('order_work_phases','order_id',o.id).sort((x,y)=>x.position-y.position);
    if(Math.abs(phases.reduce((s,p)=>s+Number(p.percentuale),0)/phases.length-Number(o.percentuale_avanzamento))<.15)continue;
    const needsDates=Number(o.percentuale_avanzamento)>0&&phases[0].start_date>TODAY;
    for(let i=0;i<phases.length;i++){
      const p=phases[i],pct=Math.round(Math.min(100,Math.max(0,Number(o.percentuale_avanzamento)*phases.length-i*100)));
      if(needsDates){
        const span=Math.round((Date.parse(o.work_end_date)-Date.parse(o.work_start_date))/86400000);
        p.start_date=addDays(o.work_start_date,Math.floor(i*span/phases.length));p.end_date=i===phases.length-1?o.work_end_date:addDays(o.work_start_date,Math.floor((i+1)*span/phases.length));
        a.push(`update order_work_phases set start_date=${quote(p.start_date)},end_date=${quote(p.end_date)},notes=concat_ws(E'\\n',notes,${quote(MARK+' Cronoprogramma riallineato alle date e all’avanzamento della commessa.')} ) where id=${quote(p.id)} and company_id=${quote(COMPANY)};`);
      }
      const subs=by('order_work_subphases','phase_id',p.id).sort((x,y)=>x.position-y.position);
      if(subs.length!==2||!subs.every(s=>s.id===uid('subphase-'+p.id+'-'+s.position)))throw Error('Cannot rewrite custom phase progress');
      a.push(`update order_work_subphases set peso=${pct>0&&pct<100?pct:1},fatta=${pct>0},fatta_il=${quote(pct>0?localTimestamp([p.end_date||o.work_end_date,TODAY].sort()[0],'16:00:00'):null)} where id=${quote(subs[0].id)} and phase_id=${quote(p.id)};`);
      a.push(`update order_work_subphases set peso=${pct>0&&pct<100?100-pct:1},fatta=${pct===100},fatta_il=${quote(pct===100?localTimestamp([p.end_date||o.work_end_date,TODAY].sort()[0],'16:00:00'):null)} where id=${quote(subs[1].id)} and phase_id=${quote(p.id)};`);
      p.percentuale=pct;
    }
  }
  // Employee inserts also created empty HR profiles. Keep the profile carrying
  // actual demonstrations, archive only the two empty auto-created duplicates.
  for(const h of d.hr_profili){
    const e=d.employees.find(e=>e.id===h.employee_id);
    if(e?.last_name==='DEMO Integrata'&&!by('hr_timbrature','profilo_id',h.id).length&&d.hr_profili.some(x=>x.employee_id===e.id&&by('hr_timbrature','profilo_id',x.id).length))a.push(`update hr_profili set attivo=false,note=${quote(MARK+' Profilo automatico duplicato vuoto; usare il profilo con le timbrature demo.')} where id=${quote(h.id)} and company_id=${quote(COMPANY)};`);
  }
  const isGoods=i=>/material|cement|gres|piastre|sanitari|finestr|portafinestr|serrament|inverter|modul|rubinett|mobile|pannell|accessor|dotazion|component|tub|doccia/i.test(i.name)&&!/manodopera|servizi|lavorazioni|demolizione|smaltimento|sopralluogo/i.test(i.name);
  for(const r of d.campo_rapportini.filter(r=>r.descrizione_lavori?.startsWith(MARK))){
    const item=by('order_items','order_id',r.order_id).find(i=>isGoods(i)&&i.phase_id===r.fasi_lavorate?.[0]?.phase_id)||by('order_items','order_id',r.order_id).find(isGoods);
    const material=item?[{nome:item.name,order_item_id:item.id,quantita:1,unita:'pz',da_furgone:false}]:[];
    a.push(`update campo_rapportini set materiali_usati=${json(material)},approvato_at=${quote(localTimestamp(r.data_lavoro,'17:10:00'))},note=${quote(MARK+' Registrazione manuale dell’ufficio. Materiali: sola dichiarazione campione, nessun nuovo scarico. Nessuna firma né GPS reale.')} where id=${quote(r.id)} and company_id=${quote(COMPANY)};`);
  }
  const occupied=new Set(d.hr_timbrature.map(t=>t.profilo_id+'|'+t.data_evento));
  for(const o of d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0&&Number(o.percentuale_avanzamento)>0&&!by('campo_rapportini','order_id',o.id).length)){
    const phase=by('order_work_phases','order_id',o.id).filter(p=>Number(p.percentuale)>0).sort((x,y)=>x.position-y.position)[0];if(!phase)throw Error('Missing executed phase');
    let date=phase.start_date||o.work_start_date;const limit=[phase.end_date||o.work_end_date,TODAY].sort()[0];let choice;
    while(date<=limit&&!choice){
      if(![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()))choice=d.employees.map(e=>({e,h:d.hr_profili.find(h=>h.employee_id===e.id&&h.attivo&&h.nome===e.first_name&&h.cognome===e.last_name)})).find(({e,h})=>h&&e.is_active&&Number(e.costo_orario)>0&&!occupied.has(h.id+'|'+date));
      if(!choice)date=addDays(date,1);
    }
    if(!choice)throw Error('No available demo crew for '+o.order_code);
    const {e,h}=choice;occupied.add(h.id+'|'+date);
    const item=by('order_items','order_id',o.id).find(isGoods);
    const rid=ins('campo_rapportini','completion-report-'+o.id,{company_id:COMPANY,order_id:o.id,user_id:ACTOR,role_type:'employee',data_lavoro:date,ore_lavorate:8,descrizione_lavori:MARK+' '+phase.name+'. Giornata dimostrativa registrata dall’ufficio.',stato:'inviato',source:'manual',approvato:false,note:MARK+' Nessuna firma né GPS; ore della squadra, non del compilatore.'},{presenze:json([{employee_id:e.id,nome:e.first_name+' '+e.last_name,ore:8}]),fasi_lavorate:json([{phase_id:phase.id,ore:8}]),materiali_usati:json(item?[{nome:item.name,order_item_id:item.id,quantita:1,unita:'pz',da_furgone:false}]:[])});
    a.push(`update campo_rapportini set stato='approvato',approvato=true,approvato_da=${quote(ACTOR)},approvato_at=${quote(localTimestamp(date,'17:10:00'))} where id=${quote(rid)} and company_id=${quote(COMPANY)} and stato='inviato';`);
    for(const [tipo,time]of [['entrata','08:00:00'],['pausa_inizio','12:00:00'],['pausa_fine','13:00:00'],['uscita','17:00:00']]){
      const hrid=ins('hr_timbrature','completion-punch-'+rid+'-'+tipo,{company_id:COMPANY,profilo_id:h.id,order_id:o.id,tipo,timestamp:localTimestamp(date,time),fonte:'manuale',validata:true,validata_da:ACTOR,note:MARK+' Timbratura sintetica del rapportino '+rid});
      ins('campo_timbrature','campo-'+hrid,{company_id:COMPANY,user_id:null,order_id:o.id,tipo,timestamp_evento:localTimestamp(date,time),fonte:'manuale',hr_timbratura_id:hrid,note:MARK+' '+e.first_name+' '+e.last_name});
    }
    const delta=money(8*Number(e.costo_orario));expectedDelta+=delta;costByOrder[o.id]=delta;
  }
  // Reconcile impossible legacy draft budgets, without changing booked costs.
  for(const c of d.contratti_subappalto){const o=d.orders.find(o=>o.id===c.order_id);if(!o||Number(c.importo_contrattuale)<=Number(o.total_amount))continue;
    const valid=by('contratti_subappalto','order_id',o.id).find(x=>x.id!==c.id&&Number(x.importo_contrattuale)<=Number(o.total_amount)&&x.note?.startsWith(MARK));
    if(valid)a.push(`update contratti_subappalto set stato='annullato',note=concat_ws(E'\\n',note,${quote(MARK+' Vecchio esempio incongruente sostituito dal contratto '+valid.numero_contratto+'. Nessun cambio dei costi contabilizzati.')} ) where id=${quote(c.id)} and company_id=${quote(COMPANY)};`);
    else {const budget=money(by('order_external_teams','order_id',o.id).reduce((s,t)=>s+Number(t.cost_preventivo??t.total_cost),0)||Number(o.total_amount)*.28);
      a.push(`update contratti_subappalto set importo_contrattuale=${budget},note=concat_ws(E'\\n',note,${quote(MARK+' Budget fittizio riconciliato alle lavorazioni assegnate; vecchio valore '+c.importo_contrattuale+'. Nessun costo aggiunto.')} ) where id=${quote(c.id)} and company_id=${quote(COMPANY)};`);}
  }
  const affected=[...new Set(a.join('\n').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)||[])].filter(id=>id!==COMPANY&&id!==ACTOR);
  const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
    do $$ begin if not exists(select 1 from companies where id=${quote(COMPANY)} and name='Demo Azienda 2 S.r.l.') or exists(select 1 from internal_automation_flows where company_id=${quote(COMPANY)} and status='published') or exists(select 1 from automations where company_id=${quote(COMPANY)} and is_active) then raise exception 'Unsafe demo preflight';end if;end $$;
    create temporary table _demo_before on commit drop as select id,consuntivo from v_ordine_marginalita where company_id=${quote(COMPANY)};
    ${a.join('\n')}
    do $$ begin if (select sum(v.consuntivo-b.consuntivo) from v_ordine_marginalita v join _demo_before b using(id))<>${expectedDelta} then raise exception 'Unexpected completion delta';end if;end $$;
    delete from automation_trigger_events where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and (${affected.map(id=>`entity_id=${quote(id)} or payload::text like ${quote('%'+id+'%')}`).join(' or ')||'false'});
    delete from wa_notifiche_event_queue where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and subject_id in (${affected.map(quote).join(',')||"''"});
    select 'completion' as batch;__END__;`;
  save('completion-plan',{company:COMPANY,marker:MARK,costByOrder,batches:[{key:'completion',sql}]});console.log({statements:a.length,costByOrder});
}
function prepareRates(){
  if(existsSync(`${OUT}/rates-applied.json`))throw Error('Rates stage already applied');
  const d=snapshot('rates-before'),a=[],priced=[];
  for(const e of d.employees.filter(e=>e.is_active&&e.area==='cantiere'&&!/subappalt/i.test(e.role_type||'')&&e.user_id!==ACTOR&&!(Number(e.costo_orario)>0))){
    const historic=d.order_employees.filter(t=>t.employee_id===e.id&&Number(t.hourly_rate)>0).map(t=>Number(t.hourly_rate));
    const rate=historic.length?Math.max(...historic):/posator/i.test(e.role_type||'')?25:/murator/i.test(e.role_type||'')?24:/capo/i.test(e.role_type||'')?32:26;
    priced.push({id:e.id,rate});
    a.push(`update employees set costo_orario=${rate},monthly_hours=coalesce(monthly_hours,168) where id=${quote(e.id)} and company_id=${quote(COMPANY)} and coalesce(costo_orario,0)=0;`);
  }
  a.push(`update order_employees t set hourly_rate=e.costo_orario,notes=concat_ws(E'\\n',t.notes,${quote(MARK+' Tariffa interna dimostrativa. Ore e consuntivo invariati; non è una seconda registrazione di costo.')} ) from employees e,orders o where t.employee_id=e.id and t.order_id=o.id and e.company_id=${quote(COMPANY)} and o.company_id=${quote(COMPANY)} and o.total_amount>0 and o.deleted_at is null and t.hours_worked=0 and t.total_cost=0 and coalesce(t.hourly_rate,0)=0 and e.costo_orario>0 and e.area='cantiere' and coalesce(e.role_type,'') not ilike '%subappalt%';`);
  const sql=`begin;set local lock_timeout='3s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
    create temporary table _demo_before on commit drop as select id,consuntivo from v_ordine_marginalita where company_id=${quote(COMPANY)};
    ${a.join('\n')}
    do $$ begin if exists(select 1 from v_ordine_marginalita v join _demo_before b using(id) where v.consuntivo is distinct from b.consuntivo) then raise exception 'Rate setup changed historic costs';end if;end $$;
    select 'rates' as batch;__END__;`;
  save('rates-plan',{company:COMPANY,marker:MARK,priced,batches:[{key:'rates',sql}]});console.log({priced:priced.length,existingCostsPreserved:true});
}
function prepareStatus(){
  if(existsSync(`${OUT}/status-applied.json`))throw Error('Status stage already applied');
  const d=snapshot('status-before'),inProgress=uid('status-work-in-progress');
  const done=d.order_statuses.find(s=>s.name==='Posa Completata'||s.name==='Lavori completati');
  const scheduled=d.order_statuses.find(s=>s.name==='Posa Programmata'||s.name==='Lavori programmati');
  const initial=d.order_statuses.find(s=>s.name==='Contratto Firmato'),support=d.order_statuses.find(s=>s.is_support_phase);
  if(!done||!initial||!scheduled)throw Error('Demo status taxonomy absent');
  const ids=d.orders.filter(o=>!o.deleted_at&&Number(o.total_amount)>0).map(o=>o.id);
  const a=[`insert into order_statuses(id,company_id,name,position,color,icon,is_default,is_support_phase) values (${quote(inProgress)},${quote(COMPANY)},'Lavori in corso',7,'#193E68','Hammer',false,false) on conflict(id) do nothing;`,
    `update order_statuses set name='Lavori programmati' where id=${quote(scheduled.id)} and company_id=${quote(COMPANY)};`,
    `update order_statuses set name='Lavori completati',position=8 where id=${quote(done.id)} and company_id=${quote(COMPANY)};`];
  if(support)a.push(`update order_statuses set position=9 where id=${quote(support.id)} and company_id=${quote(COMPANY)};`);
  for(const o of d.orders.filter(o=>ids.includes(o.id))){
    const pct=Number(o.percentuale_avanzamento),target=pct===100?done.id:pct>0?inProgress:o.current_status_id&&o.current_status_id!==done.id?o.current_status_id:initial.id;
    if(target!==o.current_status_id)a.push(`update orders set current_status_id=${quote(target)} where id=${quote(o.id)} and company_id=${quote(COMPANY)};`);
  }
  const sql=`begin;set local lock_timeout='3s';set local statement_timeout='60s';select set_config('request.jwt.claim.sub',${quote(ACTOR)},true);
    create temporary table _demo_before on commit drop as select id,consuntivo from v_ordine_marginalita where company_id=${quote(COMPANY)};
    ${a.join('\n')}
    do $$ begin if exists(select 1 from v_ordine_marginalita v join _demo_before b using(id) where v.consuntivo is distinct from b.consuntivo) then raise exception 'Status changed historic costs';end if;end $$;
    delete from automation_trigger_events where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and (entity_id in (${ids.map(quote).join(',')}) or ${ids.map(id=>`payload::text like ${quote('%'+id+'%')}`).join(' or ')});
    delete from wa_notifiche_event_queue where company_id=${quote(COMPANY)} and created_at>=transaction_timestamp() and subject_id in (${ids.map(quote).join(',')});
    select 'status' as batch;__END__;`;
  save('status-plan',{company:COMPANY,marker:MARK,batches:[{key:'status',sql}]});console.log({statements:a.length,missingStatuses:d.orders.filter(o=>ids.includes(o.id)&&!o.current_status_id).length});
}
const mode=process.argv[2]??'help';
if(mode==='help')console.log('Demo Azienda 2 ONLY: snapshot, customers, prepare/dry-run/apply, prepare-operations/dry-operations/apply-operations, prepare-finances/dry-finances/apply-finances, prepare-completion/dry-completion/apply-completion, after, inspect. Existing recovery snapshots and applied plans must not be overwritten.');
else if(mode==='snapshot')snapshot('before');
else if(mode==='customers')await customers();
else if(mode==='prepare')prepare();
else if(mode==='dry-run')execute(false);
else if(mode==='apply')execute(true);
else if(mode==='after')snapshot('after');
else if(mode==='prepare-operations')prepareOperations();
else if(mode==='dry-operations')executeOperations(false);
else if(mode==='apply-operations')executeOperations(true);
else if(mode==='prepare-finances')prepareFinances();
else if(mode==='dry-finances')executeOperations(false,'finances');
else if(mode==='apply-finances')executeOperations(true,'finances');
else if(mode==='prepare-completion')prepareCompletion();
else if(mode==='dry-completion')executeOperations(false,'completion');
else if(mode==='apply-completion')executeOperations(true,'completion');
else if(mode==='prepare-rates')prepareRates();
else if(mode==='dry-rates')executeOperations(false,'rates');
else if(mode==='apply-rates')executeOperations(true,'rates');
else if(mode==='prepare-status')prepareStatus();
else if(mode==='dry-status')executeOperations(false,'status');
else if(mode==='apply-status')executeOperations(true,'status');
else if(mode==='inspect'){
  const d=JSON.parse(readFileSync(`${OUT}/before.json`));
  console.log({counts:Object.fromEntries(Object.entries(d).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),
  invoices:d.invoices.slice(0,3),items:d.order_items.slice(0,3),reports:d.campo_rapportini.slice(-2),subcontract:d.contratti_subappalto.slice(0,2)});
}else throw Error('Unsupported mode');
