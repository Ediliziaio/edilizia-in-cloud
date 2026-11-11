import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {test} from 'node:test';
const C='3f52a5ed-0b4f-4f8f-8b92-a13f3361e474';
const source=await fs.readFile(new URL('../../supabase/functions/process-automation/index.ts', import.meta.url),'utf8');
const a=source.indexOf('async function executeSendWhatsApp('),b=source.indexOf('\n/** Il numero WhatsApp',a);
const fn=ts.transpileModule(source.slice(a,b), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function setup({company=C,contact={id:'contact',phone:'393331234567'},resolveFail=false,providerOk=true}={}){
 const calls=[],sent=[];
 const deps={resolveAutomationRecord:async()=>contact,resolveContactText:async(db,text,c,cid,options)=>{calls.push({text,options});if(resolveFail)throw Error('Missing appointment');return text;},isSolariaCompat:(cfg,c)=>c===C&&typeof cfg.migration_source_node_id==='string',numeroWhatsApp:v=>v,numeroWhatsAppPredefinito:async()=>null,fetch:async(url,p)=>{sent.push(JSON.parse(p.body));return {ok:providerOk,status:providerOk?200:400,json:async()=>({success:providerOk,error:'provider not connected'})};},erroreInvioWhatsApp:(status,r)=>r.error};
 deps.Deno={env:{get:()=> 'test-only'}};
 const run=Function(...Object.keys(deps),fn+';return executeSendWhatsApp;')(...Object.values(deps));
 const db={from:()=>({insert:async()=>({error:null})})};
 const queue={entity_type:'appointment',context_json:{payload:{appointment_id:'appointment-A'}}};
 return {calls,sent,queue,run:(cfg)=>run(db,cfg,'appointment-A',company,queue)};
}
test('Solaria uses exact triggering appointment and strict variable resolution',async()=>{const s=setup();const r=await s.run({migration_source_node_id:'source',whatsapp_text:'Hello'});assert.equal(r.success,true);assert.equal(s.calls[0].options.queueItem,s.queue);assert.equal(s.calls[0].options.entityId,'appointment-A');assert.equal(s.calls[0].options.strict,true);assert.equal(s.sent.length,1);});
test('Other companies keep existing resolution behavior',async()=>{const s=setup({company:'other'});await s.run({migration_source_node_id:'source',whatsapp_text:'Hello'});assert.deepEqual(s.calls[0].options,{});});
test('Non-migrated Solaria nodes keep existing behavior',async()=>{const s=setup();await s.run({whatsapp_text:'Hello'});assert.deepEqual(s.calls[0].options,{});});
test('Missing appointment data cannot produce an outgoing message',async()=>{const s=setup({resolveFail:true});await assert.rejects(s.run({migration_source_node_id:'source',whatsapp_text:'Hello'}),/Missing appointment/);assert.equal(s.sent.length,0);});
test('WhatsApp opt-out is respected',async()=>{const s=setup({contact:{id:'contact',phone:'393331234567',optout_whatsapp:true}});const r=await s.run({migration_source_node_id:'source',whatsapp_text:'Hello'});assert.equal(r.success,false);assert.equal(s.sent.length,0);});
test('Provider connection errors remain errors, not successful sends',async()=>{const s=setup({providerOk:false});const r=await s.run({migration_source_node_id:'source',whatsapp_text:'Hello'});assert.equal(r.success,false);assert.equal(r.error,'provider not connected');});
