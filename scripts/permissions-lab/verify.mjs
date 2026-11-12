import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {assertLocalFixture,rest,sql,userId,orderId,companyId} from './backend.mjs';
assertLocalFixture();
let checks=0;
const check=(name,fn)=>{try{fn();checks++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);throw e}};
const get=(n,path)=>{const r=rest(n,path);assert([200,204].includes(r.status),JSON.stringify(r));return r.data};
for(let n=1;n<=7;n++) {
 const row=get(n,`/orders_visibili?id=eq.${orderId}&select=id,total_amount,deposit_amount`)[0];
 check(`${n} importi proiettati`,()=>assert.equal(row.total_amount,[3,4,5].includes(n)?10000:null));
 check(`${n} nessuna altra azienda`,()=>assert.deepEqual(get(n,'/orders_visibili?id=eq.d0000000-0000-4000-a000-000000000002'),[]));
 const ledger=get(n,`/order_employees_visibili?order_id=eq.${orderId}&select=total_cost,hourly_rate`)[0];
 check(`${n} costi individuali`,()=>{assert.equal((ledger?.total_cost ?? null),n===7?350:null);assert.equal((ledger?.hourly_rate ?? null),n===7?35:null)});
 const econ=get(n,`/v_ordine_marginalita?id=eq.${orderId}&select=consuntivo,margine`)[0];
 check(`${n} conto economico senza perdere costo nascosto`,()=>{assert.equal((econ?.consuntivo ?? null),[2,4,5,7].includes(n)?2350:null);assert.equal((econ?.margine ?? null),n===5?7650:null)});
 if(n!==5)check(`${n} tabella grezza non aggira proiezione`,()=>assert.deepEqual(get(n,`/orders?id=eq.${orderId}`),[]));
 if(n!==7)check(`${n} ledger grezzo protetto`,()=>assert.deepEqual(get(n,`/order_employees?order_id=eq.${orderId}`),[]));
 const agg=rest(n,'/rpc/commessa_costo_personale_aggregato','POST',{p_order_id:orderId});
 check(`${n} aggregato separato`,()=>{if([2,4,5,7].includes(n)){assert.equal(agg.status,200);assert.equal(agg.data.cost,350);assert.deepEqual(Object.keys(agg.data).sort(),['budget','cost','unpriced']);}else assert.equal(agg.status,403)});
}
check('tecnico solo stato incassi',()=>{const r=rest(1,'/rpc/commessa_quadro_pagamenti','POST',{p_order_id:orderId});assert.equal(r.status,200);assert(!JSON.stringify(r.data).includes('3000'));});
check('HR senza importi anche nel quadro incassi',()=>{const r=rest(7,'/rpc/commessa_quadro_pagamenti','POST',{p_order_id:orderId});assert.equal(r.status,200);assert(!JSON.stringify(r.data).includes('3000'));});
const previous=sql(`select description from orders where id='${orderId}'`).trim();
try {
 const write=rest(1,`/orders_visibili?id=eq.${orderId}`,'PATCH',{description:'Verifica temporanea',total_amount:123},{Prefer:'return=representation'});
 check('modifica operativa non sovrascrive importi nascosti',()=>{assert.equal(write.status,200,JSON.stringify(write.data));assert.equal(Number(sql(`select total_amount from orders where id='${orderId}'`).trim()),10000);assert.equal(write.data[0].total_amount,null);});
}finally{sql(`update orders set description='${previous.replaceAll("'","''")}' where id='${orderId}'`)}
// Office order visibility does not depend on the CRM portfolio flag.
const otherOrder='d0000000-0000-4000-a000-000000000003';
try {
 sql(`begin;set local session_replication_role=replica;insert into orders(id,company_id,description,total_amount) values('${otherOrder}','${companyId}','Commessa di un altro ufficio',40000);commit;`);
 for(const n of [1,2,3,4,5,7]) check(`${n} ufficio vede anche commessa non assegnata`,()=>assert.equal(get(n,`/orders_visibili?id=eq.${otherOrder}&select=id`).length,1));
 check('operaio resta sulle proprie commesse',()=>assert.deepEqual(get(6,`/orders_visibili?id=eq.${otherOrder}&select=id`),[]));
}finally{sql(`begin;set local session_replication_role=replica;delete from orders where id='${otherOrder}';commit;`)}
const beforeAmount=Number(sql(`select total_amount from orders where id='${orderId}'`));
const rawWrite=rest(1,`/orders?id=eq.${orderId}`,'PATCH',{total_amount:123},{Prefer:'return=minimal'});
check('PATCH grezzo senza RETURNING non cambia importo',()=>{assert([204,403].includes(rawWrite.status));assert.equal(Number(sql(`select total_amount from orders where id='${orderId}'`)),beforeAmount)});
const paidWrite=rest(1,'/order_installments_visibili?id=eq.c1000000-0000-4000-a000-000000000001','PATCH',{is_paid:false,amount:12},{Prefer:'return=minimal'});
check('solo stato non può cambiare incasso',()=>{assert([204,403].includes(paidWrite.status),JSON.stringify(paidWrite));assert.equal(sql("select is_paid::text||':'||amount::text from order_installments where id='c1000000-0000-4000-a000-000000000001'").trim(),'true:3000')});
check('HEAD grezzo non rivela il conteggio economico',()=>{const r=rest(1,'/orders?select=total_amount','HEAD',undefined,{Prefer:'count=exact'});assert.equal(r.status,200);assert.equal(r.headers['content-range'],'*/0')});
try{sql(`update staff_permissions set sola_lettura=true where user_id='${userId(1)}'`);
check('sola lettura impedisce modifiche operative',()=>{const r=rest(1,`/orders_visibili?id=eq.${orderId}`,'PATCH',{description:'NON SALVARE'});assert.equal(r.status,403)});
}finally{sql(`update staff_permissions set sola_lettura=false,can_edit_orders=true where user_id='${userId(1)}'`)}
check('join rata fattura compatibile con mascheramento',()=>assert.equal(rest(3,`/order_installments_visibili?select=*,fattura:documenti_fiscali(id,numero,stato,importo_pagato)&order_id=eq.${orderId}`).status,200));
for(const n of [1,2,3,4,5,7]) {
 const r=rest(n,'/rpc/commessa_costo_personale_per_fase','POST',{p_order_id:orderId});
 check(`${n} esportazione usa aggregati per fase`,()=>{if([2,4,5,7].includes(n)){assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data[0].total_cost,350);assert.deepEqual(Object.keys(r.data[0]).sort(),['cost_preventivo','phase_id','total_cost']);}else assert.equal(r.status,403)});
}
check('calcolatore grezzo non richiamabile dal client',()=>assert.equal(rest(1,'/rpc/costo_orario_calcolato','POST',{p_employee_id:'e0000000-0000-4000-a000-000000000001'}).status,403));
const reportId='c4000000-0000-4000-a000-000000000001';
try {
 sql(`begin;set local session_replication_role=replica;insert into campo_rapportini(id,company_id,order_id,user_id,role_type,presenze_registrate,costo_manodopera) values('${reportId}','${companyId}','${orderId}','${userId(6)}','employee','[{"employee_id":"e0000000-0000-4000-a000-000000000001","ore":10,"costo":350,"costo_orario":35}]',350);commit;`);
 for(const n of [1,3,5,6,7]){
  const row=get(n,`/campo_rapportini_visibili?id=eq.${reportId}&select=presenze_registrate,costo_manodopera`)[0];
  check(`${n} snapshot rapportino non rivela tariffe`,()=>{assert(row);assert.equal(row.presenze_registrate[0].ore,10);assert.equal(row.presenze_registrate[0].costo,n===7?350:undefined);assert.equal(row.presenze_registrate[0].costo_orario,n===7?35:undefined)});
  if(n!==7)check(`${n} rapportino grezzo non aggira privacy`,()=>{const raw=rest(n,`/campo_rapportini?id=eq.${reportId}&select=presenze_registrate,costo_manodopera`);assert(raw.status===403 || (raw.status===200 && raw.data.length===0));});
 }
}finally{sql(`begin;set local session_replication_role=replica;delete from campo_rapportini where id='${reportId}';commit;`)}
const files=['operativo','vendita','costi','personale','riservato'];
try {
 sql(`begin;set local session_replication_role=replica;${files.map((scope,i)=>`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,access_scope) values('c6000000-0000-4000-a000-00000000000${i+1}','${orderId}','Documento ${scope}.txt','${orderId}/prova-${scope}.txt','text/plain',20,'${userId(1)}','${scope}');`).join('')}insert into marketing_contacts(id,company_id,first_name,assigned_to) values('c5000000-0000-4000-a000-000000000001','${companyId}','CRM proprio','${userId(3)}'),('c5000000-0000-4000-a000-000000000002','${companyId}','CRM altro commerciale','${userId(2)}');commit;`);
 for(const n of [1,2,3,4,5,7]){
  const rows=get(n,`/order_attachments?order_id=eq.${orderId}&id=gte.c6000000-0000-4000-a000-000000000001&id=lt.c7000000-0000-4000-a000-000000000001&select=access_scope&order=access_scope`);
  const expected=['operativo',...([3,4,5].includes(n)?['vendita']:[]),...([2,4,5,7].includes(n)?['costi']:[]),...(n===7?['personale']:[])].sort();
  check(`${n} elenco documenti segue i dati consentiti`,()=>assert.deepEqual(rows.map(r=>r.access_scope),expected));
 }
 check('commerciale CRM vede soltanto il proprio contatto',()=>assert.deepEqual(get(3,'/marketing_contacts?id=in.(c5000000-0000-4000-a000-000000000001,c5000000-0000-4000-a000-000000000002)&select=first_name').map(x=>x.first_name),['CRM proprio']));
 check('documento HR non duplicabile con classificazione pubblica',()=>assert.equal(rest(1,'/order_attachments','POST',{order_id:orderId,file_name:'copia.txt',uploaded_by:userId(1),file_size:20,file_type:'text/plain',file_url:`${orderId}/prova-personale.txt`,access_scope:'operativo'}).status,403));
}finally{sql(`begin;set local session_replication_role=replica;delete from order_attachments where id::text like 'c6000000-%';delete from marketing_contacts where id::text like 'c5000000-%';commit;`)}
const appointmentId='c8000000-0000-4000-a000-000000000001';
try {
 sql(`begin;set local session_replication_role=replica;insert into appointments(id,company_id,title,appointment_date,created_by,assigned_to) values('${appointmentId}','${companyId}','Appuntamento riservato di prova',current_date+1,'${userId(2)}','${userId(2)}');commit;`);
 check('CRM assegnati non concede il calendario privato altrui',()=>assert.deepEqual(get(1,`/appointments?id=eq.${appointmentId}&select=id`),[]));
 sql(`update staff_permissions set can_view_all_team_calendar=true where user_id='${userId(1)}'`);
 check('calendario team non svela appuntamenti privati senza collegamenti',()=>assert.deepEqual(get(1,`/appointments?id=eq.${appointmentId}&select=id`),[]));
 sql(`update appointments set order_id='${orderId}' where id='${appointmentId}'`);
 check('appuntamento operativo della commessa indipendente dal portafoglio CRM',()=>assert.equal(get(1,`/appointments?id=eq.${appointmentId}&select=id`).length,1));
}finally{sql(`begin;set local session_replication_role=replica;delete from appointments where id='${appointmentId}';update staff_permissions set can_view_all_team_calendar=false where user_id='${userId(1)}';commit;`)}
const result={checks,passed:true,environment:'local synthetic database, real PostgREST',date:new Date().toISOString()};
const reportAt=process.argv.indexOf('--report');if(reportAt>=0)writeFileSync(process.argv[reportAt+1],JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
