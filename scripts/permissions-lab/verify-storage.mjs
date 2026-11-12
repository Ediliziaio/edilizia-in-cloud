import assert from 'node:assert/strict';
import {createHmac}from'node:crypto';
import{assertLocalFixture,sql,storageService,localActorToken,orderId,userId}from'./backend.mjs';
assertLocalFixture();
const secret='local-permissions-fixture-only-secret-20261111';const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const b=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',exp:4102444800});const admin=b+'.'+createHmac('sha256',secret).update(b).digest('base64url');
const headers={authorization:`Bearer ${admin}`,'content-type':'application/json'};
const bucket=storageService('/bucket','POST',Buffer.from(JSON.stringify({id:'order-attachments',name:'order-attachments',public:false})),headers);
assert([200,400,409].includes(bucket.status),bucket.body.toString());
let checks=0;
for(const[scope,content]of [['operativo','Istruzioni operative di prova'],['vendita','Venduto 10000 euro'],['costi','Costo materiali 2000 euro'],['personale','Tariffa individuale 35 euro/ora'],['riservato','Documento riservato amministratore']]) {
 const path=`${orderId}/collaudo-${scope}.txt`;
 const upload=storageService('/object/order-attachments/'+path,'POST',Buffer.from(content),{authorization:`Bearer ${admin}`,'content-type':'text/plain','x-upsert':'true'});
 assert.equal(upload.status,200,upload.body.toString());
 sql(`insert into order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,access_scope) values('c7000000-0000-4000-a000-00000000000${['operativo','vendita','costi','personale','riservato'].indexOf(scope)+1}','${orderId}','Collaudo ${scope}.txt','${path}','text/plain',${content.length},'${userId(1)}','${scope}') on conflict(id)do update set access_scope=excluded.access_scope;`);
 for(const n of [1,2,3,4,5,6,7]) {
  const allowed=scope==='operativo' ? true : scope==='vendita'?[3,4,5].includes(n):scope==='costi'?[2,4,5,7].includes(n):scope==='personale'?n===7:false;
  const response=storageService('/object/authenticated/order-attachments/'+path,'GET',undefined,{authorization:`Bearer ${localActorToken(n)}`});
  if(allowed)assert.equal(response.body.toString(),content,`Utente ${n}, ${scope}, HTTP ${response.status}: ${response.body.toString()}`);
  else assert.notEqual(response.status,200,`Download non autorizzato utente ${n}, ${scope}`);
  checks++;console.log(`PASS utente ${n}: download ${scope} ${allowed?'consentito':'negato'}`);
 }
}
try {
 sql(`update staff_permissions set can_view_employees=false,can_view_persone=false where user_id='${userId(7)}'`);
 assert.notEqual(storageService('/object/authenticated/order-attachments/'+orderId+'/collaudo-personale.txt','GET',undefined,{authorization:`Bearer ${localActorToken(7)}`}).status,200);checks++;console.log('PASS download HR negato dopo revoca, con lo stesso JWT');
}finally{sql(`update staff_permissions set can_view_employees=true,can_view_persone=true where user_id='${userId(7)}'`)}
assert.notEqual(storageService('/object/public/order-attachments/'+orderId+'/collaudo-personale.txt','GET').status,200);checks++;console.log('PASS percorso pubblico non aggira il bucket privato');
// The customer portal must still require explicit sharing.
try {
 sql(`begin;set local session_replication_role=replica;insert into auth.users(id) values('${userId(9)}');insert into profiles(id,company_id,first_name,last_name,email) values('${userId(9)}','a0000000-0000-4000-a000-000000000001','Cliente','Simulato','u9@example.test');insert into user_roles(user_id,role) values('${userId(9)}','customer');update orders set customer_id='${userId(9)}' where id='${orderId}';update order_attachments set visible_to_customer=true where id='c7000000-0000-4000-a000-000000000001';commit;`);
 const customer={authorization:`Bearer ${localActorToken(9)}`};
 assert.equal(storageService('/object/authenticated/order-attachments/'+orderId+'/collaudo-operativo.txt','GET',undefined,customer).body.toString(),'Istruzioni operative di prova');checks++;console.log('PASS cliente scarica il solo documento condiviso');
 assert.notEqual(storageService('/object/authenticated/order-attachments/'+orderId+'/collaudo-vendita.txt','GET',undefined,customer).status,200);checks++;console.log('PASS cliente non scarica documenti interni anche conoscendo il percorso');
}finally{sql(`begin;set local session_replication_role=replica;update orders set customer_id=null where id='${orderId}';update order_attachments set visible_to_customer=false where id='c7000000-0000-4000-a000-000000000001';delete from user_roles where user_id='${userId(9)}';delete from profiles where id='${userId(9)}';delete from auth.users where id='${userId(9)}';commit;`)}
console.log(JSON.stringify({checks,passed:true,engine:'actual local Storage API, actual file bytes'}));
