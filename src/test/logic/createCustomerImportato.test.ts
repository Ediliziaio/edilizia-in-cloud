import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";
const runtime = vi.hoisted(()=>({db:null as unknown as DbMinimo,create:vi.fn(),email:vi.fn(),access:true}));
vi.mock("https://esm.sh/@supabase/supabase-js@2",()=>({createClient:()=>runtime.db}));
vi.mock("../../../supabase/functions/_shared/auth.ts",()=>({
  requireAuth:async()=>({userId:"actor",supabaseAdmin:runtime.db}),
  isSuperAdminEmailAllowed:()=>true,resolveUserEmail:async()=>"admin@example.invalid",aziendaAccessibile:async()=>runtime.access,
}));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts",()=>({sendEmailUnified:(...args:unknown[])=>runtime.email(...args)}));
vi.mock("../../../supabase/functions/_shared/getBranding.ts",()=>({getBrandingForCompany:async()=>({siteUrl:"https://example.invalid"})}));
let handler: ((req:Request)=>Promise<Response>) | null;
beforeEach(()=>{
  runtime.db=new DbMinimo();runtime.create.mockReset();runtime.email.mockReset();runtime.access=true;handler=null;
  runtime.db.tabelle.companies=[{id:"a",name:"Demo",customer_portal_enabled:true}];
  runtime.db.tabelle.profiles=[{id:"actor",company_id:"a",is_blocked:false}];
  runtime.db.tabelle.user_roles=[{user_id:"actor",role:"company_admin"}];
  runtime.db.tabelle.invoices=[{id:"i",company_id:"a",external_provider:"xml_import",deleted_at:null,client_fiscal_code:"RSSMRA80A01H501U",client_vat_number:null}];
  runtime.db.rpcs.riconcilia_cliente_emessa_importata=()=>({status:"ok",customer_id:null});
  runtime.create.mockResolvedValue({data:{user:{id:"c"}},error:null});
  Object.assign(runtime.db,{auth:{admin:{createUser:runtime.create,deleteUser:vi.fn(async()=>({error:null}))}}});
});
afterEach(()=>vi.unstubAllGlobals());
async function crea(extra:Riga={}) {
  if(!handler){
    vi.resetModules();const d=denoFinto();vi.stubGlobal("Deno",d.finto);
    const file="../../../supabase/functions/create-customer/index.ts";await import(/* @vite-ignore */file);
    handler=d.gestore() as (req:Request)=>Promise<Response>;
  }
  const response=await handler(new Request("https://example.invalid/create-customer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company_id:"a",imported_invoice_id:"i",first_name:"Mario",last_name:"Rossi",email:"mario@example.invalid",fiscal_code:"RSSMRA80A01H501U",address:"Via Demo 1",city:"Roma",postal_code:"00100",create_portal_account:true,send_welcome_email:true,...extra})}));
  return {status:response.status,data:await response.json()};
}
describe("Creazione cliente importato: gestore server reale",()=>{
  it("blocca portale/email anche se il client li richiede, usa Auth tecnica ma conserva email e indirizzo reali",async()=>{
    const r=await crea();expect(r.status).toBe(200);expect(r.data.portal_account_created).toBe(false);expect(r.data.password).toBeNull();
    expect(runtime.email).not.toHaveBeenCalled();
    expect(runtime.create.mock.calls[0][0].email).toMatch(/@no-email\.ediliziaincloud\.local$/);
    expect(runtime.db.tabelle.profiles.find(p=>p.id==="c")).toMatchObject({email:"mario@example.invalid",address:"Via Demo 1",city:"Roma",postal_code:"00100",site_address:null,portal_disabled:true,is_blocked:true});
    expect(runtime.db.tabelle.user_roles).toContainEqual(expect.objectContaining({user_id:"c",role:"customer"}));
  });
  it("riusa un cliente esistente senza modifiche, account o email",async()=>{
    runtime.db.tabelle.profiles.push({id:"existing",company_id:"a",deleted_at:null,first_name:"Mario",last_name:"Rossi",email:"conservata@example.invalid"});
    runtime.db.rpcs.riconcilia_cliente_emessa_importata=()=>({status:"ok",customer_id:"existing"});
    const r=await crea();expect(r.data).toMatchObject({reused:true,customer:{id:"existing",email:"conservata@example.invalid"}});
    expect(runtime.create).not.toHaveBeenCalled();expect(runtime.email).not.toHaveBeenCalled();expect(runtime.db.scritture).toHaveLength(0);
  });
  it("CF differente: rifiuta prima di creare account",async()=>{
    expect((await crea({fiscal_code:"BNCMRA80A01H501U"})).status).toBe(409);expect(runtime.create).not.toHaveBeenCalled();
  });
  it("fattura di un'altra azienda: non crea clienti",async()=>{
    runtime.db.tabelle.invoices[0].company_id="b";expect((await crea()).status).toBe(404);expect(runtime.create).not.toHaveBeenCalled();
  });
  it("identità ambigua: non prende il primo cliente e non duplica",async()=>{
    runtime.db.rpcs.riconcilia_cliente_emessa_importata=()=>({status:"da_verificare",motivo:"Due clienti"});
    expect((await crea()).status).toBe(409);expect(runtime.create).not.toHaveBeenCalled();
  });
  it("azienda non autorizzata: blocca prima della verifica fattura",async()=>{
    runtime.access=false;expect((await crea()).status).toBe(403);expect(runtime.create).not.toHaveBeenCalled();expect(runtime.db.rpcChiamate).toHaveLength(0);
  });
  it("account shadow concorrente già registrato: niente seconda anagrafica",async()=>{
    runtime.create.mockResolvedValue({data:{user:null},error:{message:"already been registered",code:"email_exists"}});
    const r=await crea();expect(r.status).toBe(400);expect(r.data.error).toContain("collegamenti");expect(runtime.db.scritture).toHaveLength(0);
  });
  it("creazione ordinaria senza fattura conserva il flusso portale esistente",async()=>{
    const r=await crea({imported_invoice_id:null});expect(r.status).toBe(200);expect(r.data.portal_account_created).toBe(true);
    expect(runtime.create.mock.calls[0][0].email).toBe("mario@example.invalid");expect(runtime.email).toHaveBeenCalledTimes(1);
  });
});
