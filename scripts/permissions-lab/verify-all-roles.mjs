import assert from 'node:assert/strict';
import {writeFileSync}from'node:fs';
import {createHmac}from'node:crypto';
import {assertLocalFixture,rest,sql,storageService,localActorToken,userId,orderId,companyId,actors}from'./backend.mjs';
assertLocalFixture();
const nums=[1,2,3,4,5,6,7,8,10,11,12,13,14];
const rows=[],checks=[];
const check=(actor,name,expected,actual)=>{const ok=JSON.stringify(expected)===JSON.stringify(actual);checks.push({actor,name,expected,actual,ok});console.log(`${ok?'PASS':'FAIL'} ${actors[actor-1]}: ${name} (${JSON.stringify(actual)})`);};
const data=(n,path)=>{const r=rest(n,path);return Array.isArray(r.data)?r.data:[];};
const description=sql(`select description from orders where id='${orderId}'`).trim();
const scopes=['operativo','vendita','costi','personale','riservato'];
const cid=n=>`c9000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const secret='local-permissions-fixture-only-secret-20261111';const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',exp:4102444800});const admin=body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
const store=(path,method='GET',content,token)=>storageService('/object/'+(method==='GET'?'authenticated/':'')+'order-attachments/'+path,method,content,{authorization:`Bearer ${token}`,'content-type':'text/plain','x-upsert':'true'});
try{
 sql(`begin;set local session_replication_role=replica;${[2,...nums].filter((x,i,a)=>a.indexOf(x)===i).map(n=>`insert into marketing_contacts(id,company_id,first_name,assigned_to)values('${cid(n)}','${companyId}','Contatto prova ${n}','${userId(n)}')on conflict(id)do nothing;`).join('')}commit;`);
 for(const n of nums){
  const canMain=![10,11,13].includes(n),money=[3,4,5,8].includes(n),cost=[2,4,5,7,8].includes(n),personal=[7,8].includes(n),edit=[1,2,8].includes(n);
  const orders=data(n,`/orders_visibili?id=eq.${orderId}&select=id,total_amount`);
  check(n,'commessa principale',canMain,orders.length===1);
  if(canMain)check(n,'importi di vendita',money,orders[0]?.total_amount===10000);
  check(n,'altra azienda',false,data(n,'/orders_visibili?id=eq.d0000000-0000-4000-a000-000000000002&select=id').length>0);
  check(n,'commessa altro reparto',![6,10,11,12].includes(n),data(n,'/orders_visibili?id=eq.d0000000-0000-4000-a000-000000000004&select=id').length>0);
  const write=rest(n,`/orders_visibili?id=eq.${orderId}`,'PATCH',{description:`Prova ruolo ${n}`},{Prefer:'return=minimal'});
  check(n,'modifica descrizione',edit,sql(`select description from orders where id='${orderId}'`).trim()===`Prova ruolo ${n}`);
  sql(`update orders set description='${description.replaceAll("'","''")}' where id='${orderId}'`);
  rest(n,`/orders_visibili?id=eq.${orderId}`,'PATCH',{deposit_amount:3500},{Prefer:'return=minimal'});
  check(n,'modifica importi',n===8,Number(sql(`select deposit_amount from orders where id='${orderId}'`).trim())===3500);
  sql(`update orders set deposit_amount=3000 where id='${orderId}'`);
  const employee=data(n,"/employees?id=eq.e0000000-0000-4000-a000-000000000001&select=id,gross_salary,costo_orario");
  check(n,'retribuzione individuale',personal,employee.some(e=>Number(e.gross_salary)===2800||Number(e.costo_orario)===35));
  const crm=data(n,'/marketing_contacts?id=gte.c9000000-0000-4000-a000-000000000000&select=id,assigned_to');
  check(n,'lettura CRM', [3,8,10,11].includes(n),crm.length>0);
  if([3,10,11].includes(n))check(n,'CRM solo assegnati',true,crm.every(c=>c.assigned_to===userId(n)));
  rest(n,`/marketing_contacts?id=eq.${cid(n)}`,'PATCH',{first_name:'Modifica CRM'});
  check(n,'modifica contatto proprio',[8,10,11].includes(n),sql(`select first_name from marketing_contacts where id='${cid(n)}'`).trim()==='Modifica CRM');
  sql(`update marketing_contacts set first_name='Contatto prova ${n}' where id='${cid(n)}'`);
  const downloads={};
  for(const scope of scopes){const r=store(`${orderId}/collaudo-${scope}.txt`,'GET',undefined,localActorToken(n));const allowed=canMain&&(scope==='operativo'||scope==='vendita'&&money||scope==='costi'&&cost||scope==='personale'&&personal||scope==='riservato'&&n===8);check(n,`download ${scope}`,!!allowed,r.status===200);downloads[scope]=r.status===200;}
  const path=`${orderId}/collaudo-operativo.txt`;
  try{const r=store(path,'POST',Buffer.from(`Sovrascrittura prova ${n}`),localActorToken(n));check(n,'file esistente non sovrascrivibile',false,r.status===200);}finally{const r=store(path,'POST',Buffer.from('Istruzioni operative di prova'),admin);assert.equal(r.status,200);}
  rows.push({actor:n,name:actors[n-1],order:canMain,money,cost,personal,edit,downloads,httpWrite:write.status});
 }
 for(const n of nums){
  const path=`${orderId}/collaudo-scrittura-${n}.txt`,mid=`ca000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  try{
   const upload=storageService('/object/order-attachments/'+path,'POST',Buffer.from('Nuovo documento di prova'),{authorization:`Bearer ${localActorToken(n)}`,'content-type':'text/plain','x-upsert':'false'});
   check(n,'caricamento nuovo documento',[1,2,8].includes(n),upload.status===200);
   assert.equal(store(path,'POST',Buffer.from('Documento eliminabile di prova'),admin).status,200);
   sql(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,access_scope)values('${mid}','${orderId}','Documento di prova.txt','${path}','text/plain',32,'${userId(8)}','operativo')`);
   const deletion=store(path,'DELETE',undefined,localActorToken(n));
   check(n,'eliminazione file operativo',[1,2,8].includes(n),deletion.status===200);
  }finally{
   store(path,'DELETE',undefined,admin);
   sql(`delete from order_attachments where id='${mid}'`);
  }
 }
 const ownedOrder='d0000000-0000-4000-a000-000000000004';
 for(const [id,oid,path]of [['cf000000-0000-4000-a000-000000000001',ownedOrder,`${ownedOrder}/prova-perimetro.txt`],['cf000000-0000-4000-a000-000000000002','d0000000-0000-4000-a000-000000000002','d0000000-0000-4000-a000-000000000002/prova-altra-azienda.txt']]){
  try{
   assert.equal(store(path,'POST',Buffer.from('Documento perimetro sintetico'),admin).status,200);
   sql(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,access_scope)values('${id}','${oid}','Prova perimetro.txt','${path}','text/plain',30,'${userId(8)}','operativo')`);
   for(const n of oid===ownedOrder?[13,6,10,8]:nums)check(n,oid===ownedOrder?'download della commessa del magazzino':'documento di altra azienda',oid===ownedOrder && [13,8].includes(n),store(path,'GET',undefined,localActorToken(n)).status===200);
  }finally{store(path,'DELETE',undefined,admin);sql(`delete from order_attachments where id='${id}'`);}
 }
 // Immediate revocation and blocked accounts with their existing access token.
 sql(`update profiles set is_blocked=true where id='${userId(10)}'`);
 check(10,'accesso CRM bloccato con JWT ancora valido',false,data(10,`/marketing_contacts?id=eq.${cid(10)}&select=id`).length>0);
}finally{
 sql(`begin;set local session_replication_role=replica;update profiles set is_blocked=false where id='${userId(10)}';delete from marketing_contacts where id::text like 'c9000000-%';update orders set description='${description.replaceAll("'","''")}',total_amount=10000,deposit_amount=3000 where id='${orderId}';commit;`);
}
const result={date:new Date().toISOString(),checks:checks.length,passed:checks.every(c=>c.ok),failures:checks.filter(c=>!c.ok),rows,details:checks};writeFileSync('/tmp/eic-allroles-matrix.json',JSON.stringify(result,null,2));console.log(JSON.stringify({checks:result.checks,passed:result.passed,failures:result.failures}));if(!result.passed)process.exitCode=1;
