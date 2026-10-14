import {describe,it,expect} from "vitest";
import {prepareSalLines,salListIssues,salLineAmount,salEmissionIssue} from "@/lib/orders/salDraft";
import {saveSalDraft,SalSaveError} from "@/lib/orders/saveSalDraft";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/integrations/supabase/types";
const line=(amount="100",percent="50")=>({descrizione:"Opere murarie",importo_contrattuale:amount,percentuale_avanzamento:percent,note:""});
describe("Bozza SAL: numeri coerenti con le colonne generate del database",()=>{
  it.each(["","abc","1.000,00","1,2,3","1e3","-1","Infinity"])("rifiuta importo %s senza salvarlo come zero",amount=>expect(()=>prepareSalLines([line(amount)])).toThrow());
  it.each(["-1","101","NaN",""])("rifiuta percentuale %s senza clamp silenziosi",percent=>expect(()=>prepareSalLines([line("100",percent)])).toThrow());
  it("somma le righe già arrotondate, non un totale diverso dal documento",()=>{
    expect(prepareSalLines([line("0,05","10"),line("0,05","10")],1).total).toBe(0.02);
    expect(prepareSalLines([line("100,50","25,50")],200).total).toBe(25.63);
  });
  it("arrotonda i mezzi centesimi come NUMERIC anche con molti decimali nel prodotto",()=>{
    expect(salLineAmount(0.29,50)).toBe(0.15);
    expect(salLineAmount(1.01,50)).toBe(0.51);
    expect(salLineAmount(99_999_999.99,99.99)).toBe(99_989_999.99);
  });
  it("rifiuta un totale superiore alla colonna NUMERIC prima di scrivere",()=>{
    expect(()=>prepareSalLines(Array.from({length:101},()=>line("99999999.99","100")))).toThrow("massimo");
  });
  it("non scarta righe vuote e non supera il contratto",()=>{
    expect(()=>prepareSalLines([{...line(),descrizione:""}])).toThrow();expect(()=>prepareSalLines([line("100")],50)).toThrow();
  });
  it("blocca numerazione duplicata e stati sconosciuti",()=>{
    const r={id:"1",numero_sal:1,stato:"emesso",importo_totale:50};expect(salListIssues([r,{...r,id:"2"}])).toHaveLength(1);expect(salListIssues([{...r,stato:"non_so"}])).toHaveLength(1);
  });
  it("non emette bozze retroattive né salta bozze precedenti",()=>{
    const first={id:"one",numero_sal:1,stato:"bozza"};const second={id:"two",numero_sal:2,stato:"bozza"};
    expect(salEmissionIssue(first,[first,second])).toBeNull();
    expect(salEmissionIssue(second,[first,second])).toContain("precedente");
    expect(salEmissionIssue(first,[first,{...second,stato:"firmato"}])).toContain("retroattivamente");
    expect(salEmissionIssue(second,[{...first,stato:"emesso"},second])).toBeNull();
  });
});
function db(behavior:{headerError?:boolean;lineError?:boolean;rollbackError?:boolean}={}){
  const operations:unknown[]=[];let id="";
  const client={from:(table:string)=>{
    let action="";const filters:unknown[]=[];
    const query={insert:(payload:unknown)=>{action="insert";operations.push({table,action,payload});if(table==="sal_records")id=(payload as {id:string}).id;return query;},delete:()=>{action="delete";operations.push({table,action,filters});return query;},select:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query;},single:async()=>({data:{id,company_id:"company",order_id:"order",stato:"bozza"},error:behavior.headerError?{message:"rete"}:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(table==="sal_voci" ? {data:[{id:"line",importo_sal:50}],error:behavior.lineError?{message:"fail"}:null} : {data:behavior.rollbackError?[]:[{id}],error:null}).then(resolve)};return query;
  }} as unknown as SupabaseClient<Database>;
  return {client,operations};
}
describe("Salvataggio a stadi: una bozza incompleta non matura le rate",()=>{
  const input={orderId:"order",companyId:"company",number:1,date:"2026-10-14",note:"Visibile al cliente",installmentId:"rate",lines:[line()],contractNet:100};
  it("inserisce la testata SOLO in bozza, poi le voci, senza incassi o emissione",async()=>{
    const h=db();await saveSalDraft(h.client,input);expect(h.operations).toHaveLength(2);expect(h.operations[0]).toMatchObject({table:"sal_records",payload:{stato:"bozza",importo_totale:50,installment_id:"rate"}});
  });
  it.each(["2026-02-30","2026-13-01","14/10/2026",""])("data invalida %s non raggiunge il database",async(date)=>{
    const h=db();await expect(saveSalDraft(h.client,{...input,date})).rejects.toThrow("Data SAL");expect(h.operations).toHaveLength(0);
  });
  it("header non confermato non inserisce voci e segnala rischio di doppio invio",async()=>{
    const h=db({headerError:true});const error=await saveSalDraft(h.client,input).catch(e=>e);expect(error).toBeInstanceOf(SalSaveError);expect(error.uncertain).toBe(true);expect(h.operations).toHaveLength(1);
  });
  it("errore voci annulla solo la nuova bozza, con azienda, commessa e stato nei filtri",async()=>{
    const h=db({lineError:true});await expect(saveSalDraft(h.client,input)).rejects.toThrow("annullata");expect(h.operations[2]).toMatchObject({table:"sal_records",action:"delete",filters:expect.arrayContaining([["company_id","company"],["order_id","order"],["stato","bozza"]])});
  });
  it("rollback non confermato non invita a ricreare una seconda bozza",async()=>{
    const h=db({lineError:true,rollbackError:true});const error=await saveSalDraft(h.client,input).catch(e=>e);expect(error.uncertain).toBe(true);expect(error.message).toContain("Non crearne un'altra");
  });
});
