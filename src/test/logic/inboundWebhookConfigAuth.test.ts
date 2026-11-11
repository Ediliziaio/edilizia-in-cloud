import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {hashWebhookSecret,newWebhookSecret,validateInboundMapping} from '../../../supabase/functions/_shared/inboundAutomationWebhook';
const company='00000000-0000-4000-a000-000000000001',flow='00000000-0000-4000-a000-000000000002';
function api(options:{auth?:boolean;permission?:boolean;readonly?:boolean;contactPermission?:boolean}={}){
 let handler:any;const calls:any[]=[];
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return{data:args._company_id===company&&(args._permission==='can_edit_marketing_contacts'?options.contactPermission!==false:options.permission!==false),error:null};},from:(table:string)=>{const ops:any[]=[];const q:any=new Proxy({},{get:(_,method)=>method==='then'?(resolve:any)=>{calls.push({table,ops});return Promise.resolve({data:{id:table==='automation_flows'?flow:'endpoint'},error:null}).then(resolve)}:(...args:any[])=>{ops.push([method,...args]);return q;}});return q;}};
 const raw=readFileSync('supabase/functions/automation-webhook-config/index.ts','utf8').replace(/^import .*;$/gm,'');
 const code=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 vm.runInNewContext(code,{Deno:{serve:(f:any)=>{handler=f},env:{get:()=> 'test'}},Response,crypto,hashWebhookSecret,newWebhookSecret,validateInboundMapping,getCorsHeaders:()=>({}),requireAuth:async()=>{if(options.auth===false)throw new Response(null,{status:401});return{userId:'user',supabaseAdmin:db}},createClient:()=>({rpc:async(name:string,args:any)=>{calls.push({scoped:true,name,args});return{data:options.readonly===true,error:null};}})});
 return{calls,call:(body:any)=>handler(new Request('https://example.com/config',{method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify({company_id:company,action:'create',name:'Lead esterni',flow_id:flow,mapping_json:{entity_type:'contact',entity_id_path:'contact_id',payload_paths:{}},...body})}))};
}
it('refuses missing authentication and integration-edit permission before a write',async()=>{for(const options of [{auth:false},{permission:false},{readonly:true}]){const a=api(options);expect((await a.call({})).status).toBe(options.auth===false?401:403);expect(a.calls.some(c=>c.table)).toBe(false);}});
it('checks read-only mode using the caller-scoped client, not service auth.uid()',async()=>{const a=api({readonly:true});await a.call({});expect(a.calls.find(c=>c.scoped)).toMatchObject({name:'utente_sola_lettura',args:{p_company_id:company}})});
it('returns a one-time secret but persists only its hash in the selected tenant',async()=>{const a=api();const response=await a.call({});const result=await response.json();expect(response.status).toBe(200);expect(result.secret).toMatch(/^[a-f0-9]{64}$/);const row=a.calls.find(c=>c.table==='automation_webhook_endpoints').ops.find((o:any)=>o[0]==='insert')[1];expect(row.company_id).toBe(company);expect(row.secret_hash).toBe(await hashWebhookSecret(result.secret));expect(row).not.toHaveProperty('secret');expect(a.calls.find(c=>c.table==='automation_flows').ops).toContainEqual(['eq','company_id',company]);});
it('does not allow contact intake without contact-edit permission',async()=>{const a=api({contactPermission:false});const res=await a.call({mapping_json:{entity_type:'contact',entity_mode:'contact_upsert',contact_fields:{email:'email'},payload_paths:{}}});expect(res.status).toBe(403);expect(a.calls.some(c=>c.table)).toBe(false)});
it('rejects a foreign tenant instead of using service-role writes there',async()=>{const a=api();expect((await a.call({company_id:flow})).status).toBe(403);expect(a.calls.some(c=>c.table)).toBe(false)});
