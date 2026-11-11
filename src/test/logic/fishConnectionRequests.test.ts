import { describe,it,expect,vi } from "vitest";
import { createFishManagementHandler } from "../../../supabase/functions/_shared/fishCentralino";
import { fishConnectionInput } from "../../../supabase/functions/_shared/fishConnectionRequests";
const agent={id:"agent-a",company_id:"company-a",tipo:"vocale",tools_config:{voice_provider:"fish_audio"}};
const binding={agent_id:agent.id,company_id:"company-a",fish_agent_id:"fish-a",enabled:false,published:false};
const request={id:"request-a",agent_id:agent.id,company_id:"company-a",status:"requested",number_mode:"existing",existing_number:"+39021234567"};
function setup({admin=true,superAdmin=false,duplicate=false,key=false}={}) {
 const writes:any[]=[];
 const db={from:(table:string)=>{const steps:any[]=[];const q:any=new Proxy({},{get:(_,name)=>name==="then"?(ok:any)=>{let result:any={data:null,error:null};if(table==="ai_agents_v2")result.data=agent;else if(table==="ai_fish_agents")result.data=binding;else if(table==="ai_fish_connection_requests"){const mutation=steps.find(s=>["insert","update"].includes(s[0]));if(mutation)writes.push({table,steps});result=mutation?.[0]==="insert" && duplicate?{data:null,error:{code:"23505"}}:{data:request,error:null};}return Promise.resolve(result).then(ok);}:(...args:any[])=>{steps.push([name,...args]);return q;}});return q;}};
 const fish={agentRequest:vi.fn(),listOwnVoices:vi.fn()};
 const handler=createFishManagementHandler({db,fish,secret:"unused",keyConfigured:key,authorize:async()=>({companyId:"company-a",userId:"user-a",isAdmin:admin,isSuperAdmin:superAdmin})} as any);
 const send=(action:string,body={})=>handler(new Request("https://local",{method:"POST",body:JSON.stringify({company_id:"forged-company",agent_id:"agent-a",action,...body})}));
 return {writes,fish,send};
}
describe("Phone connection requests",()=>{
 it("accepts a formatted existing number and never guesses a prefix",()=>{
  expect(fishConnectionInput({number_mode:"existing",existing_number:"+39 (02) 123-4567"})).toMatchObject({existing_number:"+39021234567",sip_available:"unknown"});
  expect(()=>fishConnectionInput({number_mode:"existing",existing_number:"021234567"})).toThrow();
  expect(fishConnectionInput({number_mode:"new",existing_number:"ignore"}).existing_number).toBeNull();
 });
 it("saves authenticated company and requestor, without provisioning a line or needing Fish credit",async()=>{
  const d=setup();const response=await d.send("request_number_connection",{number_mode:"existing",existing_number:"+39021234567",requested_by:"forged-user"});
  expect(response.status).toBe(200);expect(d.writes[0].steps.find(s=>s[0]==="insert")[1]).toMatchObject({company_id:"company-a",requested_by:"user-a",existing_number:"+39021234567"});expect(d.fish.agentRequest).not.toHaveBeenCalled();
 });
 it("returns the existing request after a duplicate submission",async()=>{
  const d=setup({duplicate:true});const response=await d.send("request_number_connection",{number_mode:"new"});
  expect(await response.json()).toMatchObject({request:{id:"request-a"},already_requested:true});expect(d.writes).toHaveLength(1);
 });
 it("prevents company users from changing platform review status",async()=>{
  const d=setup();expect((await d.send("review_number_connection",{request_id:"foreign",status:"ready"})).status).toBe(403);expect(d.writes).toEqual([]);
 });
 it("prevents a non-administrator from submitting requests",async()=>{
  const d=setup({admin:false});expect((await d.send("request_number_connection",{number_mode:"new"})).status).toBe(403);expect(d.writes).toEqual([]);
 });
 it("cannot label a line ready before it is connected and active",async()=>{
  const d=setup({superAdmin:true});expect((await d.send("review_number_connection",{request_id:"request-a",status:"ready"})).status).toBe(400);expect(d.writes).toEqual([]);
 });
 it("scopes a company reply to the waiting request and agent",async()=>{
  const d=setup();expect((await d.send("provide_number_information",{request_id:"request-a",company_reply:"Il nostro operatore è TIM."})).status).toBe(200);
  const steps=d.writes[0].steps;expect(steps).toContainEqual(["eq","company_id","company-a"]);expect(steps).toContainEqual(["eq","agent_id","agent-a"]);expect(steps).toContainEqual(["eq","status","awaiting_company"]);
 });
});
