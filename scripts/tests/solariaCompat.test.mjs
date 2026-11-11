import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOLARIA_COMPANY as C, runSolariaAction, solariaReplyValue, solariaTimeoutValid, solariaStagePatch, solariaAfterDelay, solariaSkipOutgoing } from '../../supabase/functions/_shared/solariaCompat.mjs';
const Q='10000000-0000-4000-8000-000000000001',F='10000000-0000-4000-8000-000000000002',N='10000000-0000-4000-8000-000000000003',P='10000000-0000-4000-8000-000000000004',S='10000000-0000-4000-8000-000000000005';
const cfg={migration_source_node_id:'source-node'};
const queue={id:Q,flow_id:F,current_node_id:N,context_json:{payload:{message:'Ciao, vorrei informazioni'}}};
class FakeDb {
  constructor(){this.data={automation_flows:[{id:F,company_id:C,created_by:N}],marketing_contact_notes:[],marketing_custom_fields:[{id:S,company_id:C,object_type:'contact',field_type:'date',deleted_at:null}],marketing_contact_field_values:[],marketing_pipelines:[{id:P,company_id:C}],marketing_pipeline_stages:[{id:S,pipeline_id:P,company_id:C,position:2}],marketing_opportunities:[]};this.writes=[];this.rpcCalls=[];}
  from(t){const self=this;let filters=[],mode='read',value,opts,limit;
    const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},is(k,v){filters.push(x=>(x[k]??null)===v);return q},order(){return q},limit(n){limit=n;return q},update(v){mode='update';value=v;return q},upsert(v,o){mode='upsert';value=v;opts=o;return q},maybeSingle:async()=>{const r=await exec();return {...r,data:r.data[0]??null}},then(resolve,reject){return exec().then(resolve,reject)}};
    async function exec(){let rows=self.data[t]??[];let matches=rows.filter(x=>filters.every(f=>f(x)));if(limit)matches=matches.slice(0,limit);
      if(mode==='upsert'){const old=opts?.onConflict==='contact_id,field_id'?rows.find(x=>x.contact_id===value.contact_id&&x.field_id===value.field_id):rows.find(x=>x.id===value.id);if(!old){rows.push({...value});self.writes.push({table:t,value});}else if(!opts?.ignoreDuplicates)Object.assign(old,value);self.data[t]=rows;return {data:[old??value],error:null};}
      if(mode==='update'){for(const x of matches)Object.assign(x,value);self.writes.push({table:t,value,filters:filters.length});}
      return {data:matches,error:null};}
    return q;
  }
  async rpc(name,args){this.rpcCalls.push({name,args});return {data:'2026-11-10T10:03:00Z',error:null}}
}
function args(db,extra={}){return {db,cfg:{...cfg,item_id:'squadd_add_notes',migration_note_text:'Risposta Fb Form'},companyId:C,entityId:N,queue,contact:async()=>({id:N,company_id:C}),resolveText:async s=>s,now:new Date('2026-11-10T10:00:00Z'),...extra}}
test('other companies and unmarked nodes retain existing engine paths',async()=>{
 const db=new FakeDb();assert.equal(await runSolariaAction(args(db,{companyId:P})),null);assert.equal(await runSolariaAction(args(db,{cfg:{item_id:'squadd_add_notes'}})),null);assert.deepEqual(db.writes,[]);
});
test('half-day timeout is opt-in, source-verified and bounded',()=>{
 assert.equal(solariaTimeoutValid({...cfg,migration_timeout_hours:12},C,.5),true);
 assert.equal(solariaTimeoutValid({...cfg,migration_timeout_hours:12},P,.5),false);
 assert.equal(solariaTimeoutValid({...cfg,migration_timeout_hours:24},C,.5),false);
 for(const v of [0,-1,NaN,Infinity,366])assert.equal(solariaTimeoutValid(cfg,C,v),false);
 assert.equal(solariaTimeoutValid({},P,1),true);
});
test('reply decisions read the event text, never unrelated records',()=>{
 assert.deepEqual(solariaReplyValue(cfg,C,'trigger.message',queue),{handled:true,value:'Ciao, vorrei informazioni'});
 assert.deepEqual(solariaReplyValue(cfg,P,'trigger.message',queue),{handled:false});
 assert.deepEqual(solariaReplyValue(cfg,C,'contatto.email',queue),{handled:false});
 assert.deepEqual(solariaReplyValue(cfg,C,'trigger.message',{context_json:{payload:{media:'image'}}}),{handled:true,value:''});
});
test('stage movement honours the original backwards flag',()=>{
 const old={stage_id:N},cur={position:5},back={id:S,position:2};
 assert.deepEqual(solariaStagePatch(old,back,cur,false),{});
 assert.deepEqual(solariaStagePatch(old,back,cur,true),{stage_id:S});
 assert.deepEqual(solariaStagePatch(old,{id:S,position:6},cur,false),{stage_id:S});
});
test('contact notes are idempotent across retries and preserve their author',async()=>{
 const db=new FakeDb();await runSolariaAction(args(db));await runSolariaAction(args(db));
 assert.equal(db.data.marketing_contact_notes.length,1);assert.equal(db.data.marketing_contact_notes[0].created_by,N);assert.equal(db.data.marketing_contact_notes[0].automatica,true);
});
test('cross-company contacts, flows, and note collisions are rejected',async()=>{
 const db=new FakeDb();await assert.rejects(()=>runSolariaAction(args(db,{contact:async()=>({id:N,company_id:P})})),/Contatto/);
 db.data.automation_flows[0].company_id=P;await assert.rejects(()=>runSolariaAction(args(db)),/Flusso/);assert.equal(db.writes.length,0);
 db.data.automation_flows[0].company_id=C;db.data.marketing_contact_notes.push({id:Q,company_id:P,contact_id:N});await assert.rejects(()=>runSolariaAction(args(db)),/altro record/);
});
test('current date writes only a validated custom field',async()=>{
 const db=new FakeDb();const result=await runSolariaAction(args(db,{cfg:{...cfg,item_id:'aggiorna_campo',migration_value:'Data attuale',campo:'custom_field.'+S}}));
 assert.equal(result.output.value,'2026-11-10');assert.deepEqual(db.data.marketing_contact_field_values,[{contact_id:N,field_id:S,value:'2026-11-10'}]);assert.equal(db.rpcCalls.length,0);
 await assert.rejects(()=>runSolariaAction(args(db,{cfg:{...cfg,item_id:'aggiorna_campo',migration_value:'Data attuale',campo:'company_id'}})),/Campo/);
});
test('drip waits for the reserved slot rather than delaying every contact equally',async()=>{
 const db=new FakeDb();const result=await runSolariaAction(args(db,{cfg:{...cfg,item_id:'squadd_drip',migration_batch_size:1,migration_interval_seconds:180}}));
 assert.equal(result.delayMs,180000);assert.equal(db.rpcCalls[0].args.p_queue,Q);assert.equal(db.rpcCalls[0].args.p_node,N);
});
test('legacy Create/Update updates an existing opportunity without duplication',async()=>{
 const db=new FakeDb();db.data.marketing_opportunities.push({id:Q,company_id:C,contact_id:N,pipeline_id:P,stage_id:null,name:'Nome esistente',value:7000,status:'open'});
 const result=await runSolariaAction(args(db,{cfg:{...cfg,item_id:'crea_opportunita',migration_create_update:true,pipeline_id:P,stage_id:S}}));
 assert.equal(result.output.updated,true);assert.equal(db.data.marketing_opportunities.length,1);assert.equal(db.data.marketing_opportunities[0].name,'Nome esistente');assert.equal(db.data.marketing_opportunities[0].value,7000);assert.equal(db.data.marketing_opportunities[0].stage_id,S);
});
test('new opportunities fall back to the native validated creation path',async()=>{
 const db=new FakeDb();assert.equal(await runSolariaAction(args(db,{cfg:{...cfg,item_id:'crea_opportunita',migration_create_update:true,pipeline_id:P,stage_id:S}})),null);assert.equal(db.writes.length,0);
});
test('dry-run compatibility operations never write notes or reserve slots',async()=>{
 const db=new FakeDb();const result=await runSolariaAction(args(db,{queue:{...queue,context_json:{payload:{test_mode:true}}}}));assert.equal(result.output.simulated,true);assert.equal(db.writes.length,0);assert.equal(db.rpcCalls.length,0);
});

test('past appointment reminders are skipped until the next wait',()=>{
 const delay={...cfg,delay_tipo:'prima_appuntamento'};
 const past=solariaAfterDelay(delay,C,{payload:{}},{success:true,isDelay:true,delayMs:0});
 assert.equal(solariaSkipOutgoing(cfg,C,past,'send_whatsapp'),true);
 assert.equal(solariaSkipOutgoing(cfg,C,past,'send_email'),true);
 assert.equal(solariaSkipOutgoing(cfg,C,past,'create_opportunity'),false);
 assert.equal(solariaSkipOutgoing(cfg,P,past,'send_email'),false);
 const future=solariaAfterDelay(delay,C,past,{success:true,isDelay:true,delayMs:1000});
 assert.equal(solariaSkipOutgoing(cfg,C,future,'send_email'),false);
 const next=solariaAfterDelay({...cfg,delay_tipo:'attendi'},C,past,{success:true,isDelay:true,delayMs:1000});
 assert.equal(next._solaria_skip_outgoing,false);
});

test('pipeline tags resolve the event pipeline and keep the canonical routing tag',async()=>{
 const db=new FakeDb();db.data.marketing_pipelines[0].name='Fotovoltaico Lead Fb Noleggio';db.data.marketing_contacts=[{id:N,company_id:C,tags:['cliente']}];
 const result=await runSolariaAction(args(db,{cfg:{...cfg,item_id:'aggiungi_tag',migration_pipeline_tag:true,migration_pipeline_category_tags:{[P]:'pl - impianto fotovoltaico'}},queue:{...queue,context_json:{payload:{pipeline_id:P}}},contact:async()=>db.data.marketing_contacts[0]}));
 assert.equal(result.success,true);assert.deepEqual(db.data.marketing_contacts[0].tags,['cliente','pl - fotovoltaico lead fb noleggio','pl - impianto fotovoltaico']);
});

test('current date uses Rome midnight and a same-day retry does not write again',async()=>{
 const db=new FakeDb();const input=args(db,{cfg:{...cfg,item_id:'aggiorna_campo',migration_value:'Data attuale',campo:'custom_field.'+S},now:new Date('2026-11-10T23:30:00Z')});
 const first=await runSolariaAction(input);assert.equal(first.output.value,'2026-11-11');const writes=db.writes.length;
 const retry=await runSolariaAction(input);assert.equal(retry.output.existing,true);assert.equal(db.writes.length,writes);assert.equal(db.data.marketing_contact_field_values.length,1);
});
test('current date rejects foreign, deleted, wrong-object and non-date fields before a write',async()=>{
 for(const patch of [{company_id:P},{deleted_at:'2026-11-01'},{object_type:'opportunity'},{field_type:'text'}]){
  const db=new FakeDb();Object.assign(db.data.marketing_custom_fields[0],patch);
  await assert.rejects(()=>runSolariaAction(args(db,{cfg:{...cfg,item_id:'aggiorna_campo',migration_value:'Data attuale',campo:'custom_field.'+S}})),/Campo data/);assert.equal(db.writes.length,0);
 }
});
test('current date never reports success if storage does not confirm the value',async()=>{
 const db=new FakeDb();const from=db.from.bind(db);db.from=t=>{const q=from(t);if(t==='marketing_contact_field_values'){q.upsert=()=>{q.maybeSingle=async()=>({data:null,error:null});return q;};}return q;};
 await assert.rejects(()=>runSolariaAction(args(db,{cfg:{...cfg,item_id:'aggiorna_campo',migration_value:'Data attuale',campo:'custom_field.'+S}})),/confermato/);
});
