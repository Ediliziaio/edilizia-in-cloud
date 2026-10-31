/// <reference types="node" />
import {describe,it,expect,vi} from "vitest";
import {readFileSync,writeFileSync} from "node:fs";
import ts from "typescript";
import {buildSalHtml,chiaveVoce,type SalRecord} from "../../../supabase/functions/generate-sal-pdf/render";
import {maturatoPrecedente} from "../../../supabase/functions/_shared/salNetto";
const record=(state="emesso"):SalRecord=>({id:"sal",numero_sal:3,data_emissione:"2026-10-14",stato:state,importo_totale:30000,note:"Lavori verificati dall'ufficio",order_id:"order",company_id:"company",sal_voci:[{id:"v",descrizione:"Opere murarie e finiture",importo_contrattuale:40000,percentuale_avanzamento:75,importo_sal:30000,note:null}]});
const company={ragione_sociale:"Azienda DEMO",partita_iva:null as null,colore_primario:"#1e3a5f",logo_url:null as null};
describe("Documento SAL progressivo",()=>{
  it("evidenzia il cumulativo e SOLO la quota nuova, non una seconda fattura",()=>{
    const html=buildSalHtml(record(),{description:"Ristrutturazione DEMO",order_code:"DEMO-ORD-01",total_amount:40000,indirizzo_lavori:"Via Esempio 10 · Cantiere DEMO",customer:{first_name:"Cliente",last_name:"DEMO",address:"Indirizzo fittizio"}},company,null,"DEMO",20000);
    expect(html).toContain("Quota nuova di questo SAL");expect(html).toContain("10.000,00");expect(html).toContain("30.000,00");expect(html).toContain("non è una fattura");expect(html).not.toContain("/firma-sal/");
    if(process.env.SAL_HTML_PROOF)writeFileSync(process.env.SAL_HTML_PROOF,html);
  });
  it("blocca voci assenti o incoerenti prima di produrre un documento",()=>{
    expect(()=>buildSalHtml({...record(),sal_voci:[]},null,company)).toThrow();expect(()=>buildSalHtml({...record(),importo_totale:29999},null,company)).toThrow();
    expect(()=>buildSalHtml({...record(),sal_voci:[{...record().sal_voci[0],percentuale_avanzamento:50}]},null,company)).toThrow();
  });
  it("include cliente e cantiere senza eseguire contenuti inseriti nei dati",()=>{
    const html=buildSalHtml(record(),{description:"Opere",order_code:"TEST",total_amount:40000,work_address:'<script>cantiere</script>',customer:{first_name:'<img src="x">',last_name:"DEMO",address:"Via prova"}},company);
    expect(html).toContain("Committente");expect(html).toContain("Via prova");expect(html).toContain("&lt;script&gt;cantiere");expect(html).not.toContain('<img src="x">');
  });
  it("marca una bozza non emessa e rende innocue note HTML",()=>{
    const html=buildSalHtml({...record("bozza"),note:'<img src="x" onerror="alert(1)">'},null,company);
    expect(html).toContain("BOZZA - Non emessa");expect(html).toContain("&lt;img");expect(html).not.toContain('<img src="x"');
  });
});
function harness(options:{prepare?:boolean;state?:string;permitted?:boolean;editPermitted?:boolean;tokenError?:boolean}={}){
  let handler!:(req:Request)=>Promise<Response>;const insert=vi.fn();const rpc=vi.fn().mockImplementation((_name:string,input:{_permission:string})=>Promise.resolve({data:input._permission==="can_edit_orders" ? options.editPermitted??true : options.permitted??true,error:null as null}));
  const sal=record(options.state??"emesso");
  const db={auth:{getUser:async()=>({data:{user:{id:"user"}},error:null as null})},rpc,from:(table:string)=>{
    let columns="";const q={select:(value:string)=>{columns=value;return q;},eq:()=>q,is:()=>q,gte:()=>q,order:()=>q,limit:()=>q,lt:()=>q,in:()=>q,insert:(value:unknown)=>{insert(table,value);return q;},maybeSingle:async()=>({data:table==="companies"?{logo_url:null as null}:null,error:null as null}),single:async()=>({data:table==="sal_records"?sal:table==="orders"?{company_id:"company",description:"Cantiere TEST",order_code:"TEST",total_amount:40000}:table==="anagrafica_azienda"?company:{token:"generated"},error:options.tokenError&&table==="sal_signature_tokens"?{message:"fail"}:null}),then:(fn:(v:unknown)=>unknown)=>Promise.resolve({data:columns==="id,numero_sal,stato,importo_totale"?[{id:"prior",numero_sal:2,stato:"emesso",importo_totale:20000}]:[],error:null as null}).then(fn)};return q;
  }};
  const code=ts.transpileModule(readFileSync("supabase/functions/generate-sal-pdf/index.ts","utf8").replace(/^import .*;\n/gm,""),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("Deno","createClient","verifyCompanyAccess","getCorsHeaders","getBrandingForCompany","logoDiRiserva","buildSalHtml","chiaveVoce","maturatoPrecedente",code)(
    {serve:(h:typeof handler)=>{handler=h;},env:{get:()=>"TEST"}},()=>db,async()=>{},()=>({}),async()=>({siteUrl:"https://example.invalid",platformName:"DEMO",hidePoweredBy:true}),(): null =>null,buildSalHtml,chiaveVoce,maturatoPrecedente);
  return {insert,rpc,run:()=>handler(new Request("https://example.invalid/sal",{method:"POST",headers:{Authorization:"Bearer TEST"},body:JSON.stringify({sal_id:"sal",company_id:"company",prepare_signature:options.prepare??false})}))};
}
describe("Anteprima separata dalla preparazione firma: handler reale, servizi simulati",()=>{
  it("una stampa non crea token né scrive dati",async()=>{const h=harness();const r=await h.run();expect(r.status).toBe(200);expect(await r.json()).toMatchObject({signature_url:null});expect(h.insert).not.toHaveBeenCalled();expect(h.rpc).toHaveBeenCalledWith("has_permission_for_company",expect.objectContaining({_permission:"can_view_order_amounts"}));});
  it("una bozza non riceve un link cliente",async()=>{const h=harness({prepare:true,state:"bozza"});expect((await h.run()).status).toBe(409);expect(h.insert).not.toHaveBeenCalled();});
  it("il link è un'azione esplicita di modifica e richiede permesso",async()=>{const h=harness({prepare:true,permitted:false});expect((await h.run()).status).toBe(403);expect(h.insert).not.toHaveBeenCalled();});
  it("la lettura degli importi non concede da sola la creazione del link",async()=>{const h=harness({prepare:true,editPermitted:false});expect((await h.run()).status).toBe(403);expect(h.insert).not.toHaveBeenCalled();});
  it("il fallimento di creazione token non è successo",async()=>{const h=harness({prepare:true,tokenError:true});expect((await h.run()).status).toBe(500);});
  it("una variante documentale firmata non riceve un secondo link",async()=>{const h=harness({prepare:true,state:"firmato"});expect((await h.run()).status).toBe(409);expect(h.insert).not.toHaveBeenCalled();});
});
