import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as helpers from "../../../supabase/functions/_shared/formCustomFields";
const company = "11111111-1111-4111-8111-111111111111", fieldId = "22222222-2222-4222-8222-222222222222";
const source = ts.transpileModule(readFileSync("supabase/functions/form-submit/index.ts","utf8").replace(/^import .*$/gm,""), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup({ unavailable = false, saveError = false, missingAck = false, checkbox = false } = {}) {
  const calls: Array<{table:string; method:string; value:unknown}> = [];
  let handler: (r:Request)=>Promise<Response>;
  const form = { id:"form",company_id:company,is_published:true,is_active:true,settings:{},theme:{},fields:[{id:"phone",name:"phone",type:"phone",mapping:"phone",required:true},{id:"extra",name:"extra",type:checkbox?"checkbox":"number",mapping:`cf:${fieldId}`}] };
  const def: helpers.CustomContactDefinition = {id:fieldId,company_id:company,object_type:"contact",name:"Extra",field_type:checkbox?"checkbox":"number",deleted_at:null};
  const db = { rpc:async():Promise<{data:null;error:null}>=>({data:null,error:null}), from(table:string) {
    const q:unknown = new Proxy({}, {get(_t,key:string) {
      if(key==="then") return (ok:(v:unknown)=>unknown) => Promise.resolve(
        table==="lead_forms" ? {data:form,error:null} : table==="marketing_custom_fields" ? {data:unavailable?[]:[def],error:null}
        : table==="marketing_contacts" ? {data:{id:"contact"},error:null} : table==="marketing_contact_field_values" ? {data:missingAck?[]:[{field_id:fieldId}],error:saveError?{code:"TEST_ERROR"}:null}
        : {data:{id:"submission"},error:null}).then(ok);
      return (value:unknown)=> {if(["insert","update","upsert","delete"].includes(key))calls.push({table,method:key,value});return q;};
    }}); return q;
  }};
  vm.runInNewContext(source,{...helpers,createClient:()=>db,getCorsHeaders:()=>({}),Deno:{serve:(fn:typeof handler)=>{handler=fn;},env:{get:()=>"not-a-real-key"}},crypto:webcrypto,TextEncoder,Response,console:{log(){},error(){},warn(){}},fetch:()=>{throw new Error("NETWORK FORBIDDEN");}});
  return {calls,capabilities:()=>handler(new Request("https://example.invalid/form-submit",{method:"GET"})),send:async(value:unknown)=>handler(new Request("https://example.invalid/form-submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({form_id:"form",data:{phone:"+390000000000",extra:value}})}))};
}
describe("form-submit: handler reale, backend simulato senza rete",()=>{
  it("dichiara le capacità senza leggere dati o scrivere",async()=>{
    const s=setup();const response=await s.capabilities();expect(await response.json()).toEqual({capabilities:{custom_contact_fields:1}});expect(s.calls).toHaveLength(0);
  });
  it("rifiuta una destinazione non attiva prima di qualsiasi scrittura",async()=>{
    const s=setup({unavailable:true}); expect((await s.send(12)).status).toBe(400); expect(s.calls).toHaveLength(0);
  });
  it("rifiuta un valore tipizzato invalido prima di creare il contatto",async()=>{
    const s=setup(); expect((await s.send("non numero")).status).toBe(400); expect(s.calls).toHaveLength(0);
  });
  it.each([{saveError:true},{missingAck:true}])("non conferma l'invio con salvataggio custom incompleto %j",async scenario=>{
    const s=setup(scenario); expect((await s.send(12)).status).toBe(500);
    expect(s.calls.some(c=>c.table==="form_submissions")).toBe(false);
  });
  it.each([[0,false,"0"],[false,true,"false"]])("salva %s prima dell'evento di submission",async(value,checkbox,expected)=>{
    const s=setup({checkbox});const response=await s.send(value); expect(response.status).toBe(200); expect((await response.json()).ok).toBe(true);
    const index=s.calls.findIndex(c=>c.table==="marketing_contact_field_values");
    expect(s.calls[index].value).toEqual([{contact_id:"contact",field_id:fieldId,value:expected}]);
    expect(s.calls.findIndex(c=>c.table==="form_submissions")).toBeGreaterThan(index);
  });
});
