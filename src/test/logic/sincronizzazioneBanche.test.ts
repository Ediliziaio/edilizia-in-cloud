import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggiornaConnessioneBanca, sincronizzaBancheAzienda } from "@/lib/banking/sincronizzazione";

const state=vi.hoisted(()=>({rows:[] as {id:string;provider_slug:string;institution_name:string;accounts_count:number}[],error:null as null|Error,invoke:vi.fn(),filters:[] as unknown[][]}));
vi.mock("@/lib/banking/distyra",()=>({invokeDistyra:(...args:unknown[])=>state.invoke(...args)}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
  state.filters.push(["from",table]);
  const q={select:()=>q,eq:(...args:unknown[])=>{state.filters.push(["eq",...args]);return q;},neq:(...args:unknown[])=>{state.filters.push(["neq",...args]);return q;},
    then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:state.rows,error:state.error}).then(resolve)};
  return q;
}}}));
beforeEach(()=>{vi.clearAllMocks();state.rows=[1,2,3].map(n=>({id:`banca-${n}`,provider_slug:"distyra",institution_name:`Banca ${n}`,accounts_count:1}));state.error=null;state.filters=[];
  state.invoke.mockImplementation(async(_company,{action})=>action==="finalize"?{conti:1}:{movimenti:7});
});
describe("Unico flusso Distyra per tutti i pulsanti di Tesoreria",()=>{
  it("sincronizza tre collegamenti distinti usando solo Distyra e l'azienda selezionata",async()=>{
    expect(await sincronizzaBancheAzienda("azienda",true)).toEqual({totale:3,aggiornate:3,movimenti:21,avvisi:[],errori:[]});
    expect(state.filters).toContainEqual(["eq","company_id","azienda"]);
    expect(state.filters).toContainEqual(["eq","provider_slug","distyra"]);
    expect(state.filters).toContainEqual(["neq","status","disconnected"]);
    expect(state.invoke.mock.calls.map(([,b])=>[b.action,b.connection_id])).toEqual([1,2,3].flatMap(n=>[["finalize",`banca-${n}`],["sync",`banca-${n}`]]));
    expect(state.invoke.mock.calls.filter(([,b])=>b.action==="sync").every(([c,,o])=>c==="azienda"&&o.onScreen===true)).toBe(true);
  });
  it("un consenso non pronto non ferma le altre banche né viene contato come importato",async()=>{
    state.invoke.mockImplementation(async(_c,b)=>{if(b.connection_id==="banca-1")throw new Error("Consenso non pronto");return b.action==="finalize"?{conti:1}:{movimenti:2};});
    const r=await sincronizzaBancheAzienda("azienda",true);
    expect(r).toMatchObject({totale:3,aggiornate:2,movimenti:4,errori:["Banca 1: Consenso non pronto"]});
  });
  it("conti salvati ma limite sui movimenti restano un avviso, non un successo con zero",async()=>{
    state.invoke.mockImplementation(async(_c,b)=>{if(b.action==="sync")throw new Error("Limite giornaliero");return {conti:3};});
    const r=await sincronizzaBancheAzienda("azienda",true);
    expect(r.aggiornate).toBe(0);expect(r.errori).toEqual([]);expect(r.avvisi).toHaveLength(3);
    expect(r.avvisi[0]).toContain("Conti collegati (3). Limite giornaliero");
  });
  it("chi consulta i movimenti non finalizza o modifica i consensi",async()=>{
    await sincronizzaBancheAzienda("azienda",false);
    expect(state.invoke).toHaveBeenCalledTimes(3);expect(state.invoke.mock.calls.every(([,b])=>b.action==="sync")).toBe(true);
  });
  it("zero conti e risposte prive di conferma non diventano successi",async()=>{
    state.invoke.mockResolvedValue({conti:0});await expect(aggiornaConnessioneBanca("azienda",state.rows[0],true)).rejects.toThrow(/preparando/);
    expect(state.invoke).toHaveBeenCalledTimes(1);
    state.invoke.mockResolvedValue({});expect(await aggiornaConnessioneBanca("azienda",state.rows[0],false)).toMatchObject({avviso:expect.stringContaining("non ha ancora confermato")});
  });
  it("nessun collegamento e letture fallite non avviano richieste bancarie",async()=>{
    state.rows=[];expect((await sincronizzaBancheAzienda("azienda",true)).totale).toBe(0);
    state.error=new Error("database");await expect(sincronizzaBancheAzienda("azienda",true)).rejects.toThrow(/leggere/);
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("i connettori dismessi non vengono mai invocati come ripiego",async()=>{
    await expect(aggiornaConnessioneBanca("azienda",{id:"vecchio",provider_slug:"saltedge"},true)).rejects.toThrow(/Connessioni/);
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
