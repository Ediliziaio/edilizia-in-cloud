import assert from 'node:assert/strict';
import{createClient}from'@supabase/supabase-js';
import{assertLocalFixture,sql,companyId,userId,rest}from'../backend.mjs';
assertLocalFixture();const users=new Map();
const task='e2000000-0000-4000-a000-000000000001',office='e1000000-0000-4000-a000-000000000001';
for(const n of [1,2,4,8,14]){const c=createClient('http://127.0.0.1:5189','local-fixture',{auth:{persistSession:false,autoRefreshToken:false}});const l=await c.auth.signInWithPassword({email:`u${n}@example.test`,password:'LocalePermessi2026!'});assert.equal(l.error,null);const ch=await c.rpc('ensure_user_silvio_channel');assert.equal(ch.error,null);users.set(n,{token:l.data.session.access_token,channel:ch.data});}
async function call(n,endpoint,body){const r=await fetch('http://127.0.0.1:5189/functions/v1/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+users.get(n).token},body:JSON.stringify(body)});return{status:r.status,...await r.json()};}
const chat=(n,message,extra={})=>call(n,'silvio-chat',{channel_id:users.get(n).channel,message,...extra});
const confirm=(n,id,extra={})=>call(n,'silvio-execute-action',{proposal_id:id,...extra});
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS',name);};
const proposal=async(n,message)=>{const r=await chat(n,message);const id=r.tool_calls?.find(t=>t.proposal_id)?.proposal_id;assert.ok(id,JSON.stringify(r));return id;};
// Reset the synthetic task to a free queue, never bypass real production auth.
sql(`begin;set local role service_role;update tasks set assigned_to=null where id='${task}';commit;`);
await check('attività leggibili senza JSON tecnico',async()=>{const r=await chat(1,'LEGGI ATTIVITA');assert.ok(r.reply.includes('LAB Controllare documenti'),JSON.stringify(r));assert.ok(!r.reply.includes('"ufficio_id"'));});
await check('altra area non riceve il contenuto',async()=>{const r=await chat(4,'LEGGI ATTIVITA');assert.ok(!r.reply.includes('LAB Controllare documenti'));});
let id=await proposal(1,'AREA PRENDI');
await check('proposta non modifica il responsabile',async()=>assert.equal(sql(`select coalesce(assigned_to::text,'') from tasks where id='${task}'`).trim(),''));
await check('un altro utente non conferma la proposta',async()=>assert.equal((await confirm(2,id)).status,403));
await check('revoca appartenenza prima della conferma nega l’azione',async()=>{sql(`delete from ufficio_membri where ufficio_id='${office}' and profile_id='${userId(1)}'`);try{assert.notEqual((await confirm(1,id)).ok,true);}finally{sql(`insert into ufficio_membri(ufficio_id,profile_id,company_id) values('${office}','${userId(1)}','${companyId}')`);}});
id=await proposal(1,'AREA PRENDI');
await check('conferma prende in carico come utente corrente',async()=>{const r=await confirm(1,id);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(sql(`select assigned_to from tasks where id='${task}'`).trim(),userId(1));});
await check('replay conferma bloccato',async()=>assert.notEqual((await confirm(1,id)).ok,true));
await check('altro membro non sottrae attività neanche forzando il modello',async()=>{const p=await proposal(2,'AREA PRENDI');assert.notEqual((await confirm(2,p)).ok,true);assert.equal(sql(`select assigned_to from tasks where id='${task}'`).trim(),userId(1));});
await check('falsificare l’assegnatario non aggira il JWT',async()=>{const p=await proposal(1,'AREA PRENDI FORZA');assert.notEqual((await confirm(1,p)).ok,true);});
await check('sola lettura nega la proposta',async()=>{const r=await chat(14,'AREA PRENDI');assert.ok(!r.tool_calls?.some(t=>t.proposal_id));});
await check('rilascio autorizzato restituisce all’area',async()=>{const p=await proposal(1,'AREA RILASCIA');const r=await confirm(1,p);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(sql(`select coalesce(assigned_to::text,'') from tasks where id='${task}'`).trim(),'');});
await check('creazione area con conferma e policy predefinita per staff',async()=>{const p=await proposal(1,'AREA CREA');const r=await confirm(1,p);assert.equal(r.ok,true,JSON.stringify(r));});
await check('chi non appartiene non crea attività in area altrui',async()=>{const p=await proposal(4,'AREA CREA');assert.notEqual((await confirm(4,p)).ok,true);});
console.log(JSON.stringify({ok:true,checks,model:'adversarial simulator; actual chat/action handlers, JWT and RLS'}));
