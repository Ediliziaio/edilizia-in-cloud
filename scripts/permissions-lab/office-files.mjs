import assert from 'node:assert/strict';import{assertLocalFixture,sql,rest,storageService,localActorToken,companyId,userId}from'./backend.mjs';
assertLocalFixture();const task='e2000000-0000-4000-a000-000000000001',office='e1000000-0000-4000-a000-000000000001';
const path=companyId+'/'+task+'/LAB-area-'+Date.now()+'.txt';const auth=n=>({Authorization:'Bearer '+localActorToken(n)});
let checks=0;const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
let r=storageService('/object/task-attachments/'+path,'POST',Buffer.from('LAB contenuto ufficio'),{...auth(1),'Content-Type':'text/plain'});
check(r.status<300,true,'area member can upload');
r=rest(1,'/task_attachments','POST',{task_id:task,company_id:companyId,file_name:'LAB-area.txt',storage_path:path,uploaded_by:userId(1)});check(r.status,201,'attachment metadata saved');
check(storageService('/object/authenticated/task-attachments/'+path,'GET',undefined,auth(2)).status,200,'colleague authorized to download');
check(rest(2,`/task_attachments?task_id=eq.${task}`).data.length,1,'colleague sees metadata');
check(storageService('/object/authenticated/task-attachments/'+path,'GET',undefined,auth(4)).status>=400,true,'other office cannot download by guessing URL');
check(rest(4,`/task_attachments?task_id=eq.${task}`).data.length,0,'other office cannot read metadata');
check(storageService('/object/public/task-attachments/'+path,'GET').status>=400,true,'public download denied');
sql(`delete from ufficio_membri where ufficio_id='${office}' and profile_id='${userId(2)}'`);
try{check(storageService('/object/authenticated/task-attachments/'+path,'GET',undefined,auth(2)).status>=400,true,'removed colleague denied immediately');check(rest(2,`/task_attachments?task_id=eq.${task}`).data.length,0,'removed colleague cannot read metadata');}
finally{sql(`insert into ufficio_membri(ufficio_id,profile_id,company_id) values('${office}','${userId(2)}','${companyId}')`);}
check(storageService('/object/task-attachments/'+path+'readonly','POST',Buffer.from('LAB'),{...auth(14),'Content-Type':'text/plain'}).status>=400,true,'readonly cannot upload');
console.log(JSON.stringify({ok:true,checks,backend:'actual isolated Storage API/PostgREST'}));
