/// <reference types="node" />
import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {pendingVariation,escapeVariationHtml,variationEmailAmount} from "../../../supabase/functions/invia-odv/guards";
/** Runs the actual Deno handler with isolated DB/mail adapters: no network or real email. */
function harness(options: {status?: string; permission?: boolean; providerOk?: boolean; token?: string | null; tokenConflict?: boolean} = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const send=vi.fn().mockResolvedValue({ok:options.providerOk ?? true});const update=vi.fn();
  const odv={id:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",company_id:"company",created_at:new Date().toISOString(),status:options.status ?? "in_attesa",firma_token:options.token === undefined ? "existing-token" : options.token,titolo:'Extra <img src="x">',descrizione:"Prima riga\nSeconda riga",impatto_economico:-100,numero_odv:1,order:{company_id:"company",customer:{email:"test@example.invalid",full_name:"Cliente <x>"}}};
  const admin={rpc:vi.fn().mockResolvedValue({data:options.permission ?? true,error:null as null}),from:(table:string)=>{
    let updating=false;let token="";
    const builder={select:()=>builder,eq:()=>builder,is:()=>builder,
      update:(payload:{firma_token:string})=>{updating=true;token=payload.firma_token;update(payload);return builder;},
      single:async()=>({data:table==="companies"?{name:"Azienda DEMO"}:odv,error:null as null}),
      maybeSingle:async()=>({data:updating&&!options.tokenConflict?{id:odv.id,firma_token:token}:null,error:null as null})};return builder;
  }};
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
  const code=ts.transpileModule(readFileSync("supabase/functions/invia-odv/index.ts","utf8").replace(/^import .*;\n/gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function("Deno","getCorsHeaders","errorResponse","jsonResponse","requireAuth","requireCompanyAccess","sendEmailUnified","getBrandingForCompany","pendingVariation","escapeVariationHtml","variationEmailAmount",code)(
    {serve:(fn:typeof handler)=>{handler=fn;}},()=>({}), (message:string,status=400)=>json({error:message},status),json,
    async()=>({userId:"user",supabaseAdmin:admin}),async()=>({}),send,
    async()=>({siteUrl:"https://example.invalid",platformName:"DEMO",hidePoweredBy:true}),pendingVariation,escapeVariationHtml,variationEmailAmount);
  const run=()=>handler(new Request("https://example.invalid/invia-odv",{method:"POST",body:JSON.stringify({odv_id:odv.id})}));
  return {run,send,update,handler};
}
describe("Invio email variante, simulazioni operative",()=>{
  it.each(["approvato","rifiutato","annullato"])("non riapre una variante %s",async status=>{
    const h=harness({status});expect((await h.run()).status).toBe(409);expect(h.update).not.toHaveBeenCalled();expect(h.send).not.toHaveBeenCalled();
  });
  it("blocco permessi prima di invii e scritture",async()=>{const h=harness({permission:false});expect((await h.run()).status).toBe(403);expect(h.send).not.toHaveBeenCalled();expect(h.update).not.toHaveBeenCalled();});
  it("riusa il token senza cambiare stato e mostra credito negativo, contenuto escapato",async()=>{
    const h=harness();const response=await h.run();expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,token:"existing-token"});
    expect(h.update).not.toHaveBeenCalled();const email=h.send.mock.calls[0][0];expect(email.html).toContain("-100,00");expect(email.html).toContain("&lt;img");expect(email.html).not.toContain('<img src="x">');expect(email.html).toContain("Prima riga<br>Seconda riga");
  });
  it("provider in errore non produce successo",async()=>{const h=harness({providerOk:false});const r=await h.run();expect(r.status).toBe(502);expect(await r.json()).not.toHaveProperty("success",true);});
  it("nuovo token solo su variante ancora pendente e solo se il CAS ha confermato",async()=>{
    const h=harness({token:null,tokenConflict:true});expect((await h.run()).status).toBe(409);expect(h.update.mock.calls[0][0]).not.toHaveProperty("status");expect(h.send).not.toHaveBeenCalled();
  });
  it("rifiuta metodi non POST senza inviare",async()=>{const h=harness();expect((await h.handler(new Request("https://example.invalid"))).status).toBe(405);expect(h.send).not.toHaveBeenCalled();});
});
