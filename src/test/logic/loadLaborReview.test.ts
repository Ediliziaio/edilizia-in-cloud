import {beforeEach,describe,expect,it,vi} from "vitest";
import {loadLaborReview,recheckLaborApproval} from "@/lib/campo/loadLaborReview";
import type {LaborEmployee,LaborReport} from "@/lib/campo/laborCostReview";

const state=vi.hoisted(()=>({
  reports:[] as LaborReport[],employees:[] as (LaborEmployee & {company_id:string})[],
  labor:[] as Array<{id:string;cost_preventivo:number;total_cost:number;order_id:string}>,
  calls:[] as Array<{table:string;selected:string;filters:Array<[string,string,unknown]>}>,
  failure:"",shortCount:false,changeBetweenReads:false,missingTarget:false,
}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
  const call={table,selected:"",filters:[] as Array<[string,string,unknown]>};state.calls.push(call);
  const resolve=()=>{
    let rows:Record<string,unknown>[] = (table==="campo_rapportini"?state.reports:table==="employees"?state.employees:state.labor).map(row => ({ ...row }));
    for(const [operator,column,value] of call.filters){
      if(column==="order.company_id")continue;
      rows=rows.filter(row=>operator==="eq"?row[column]===value:operator==="gt"?String(row[column])>String(value):(value as unknown[]).includes(row[column]));
    }
    const count=rows.length+(state.shortCount&&table==="employees"?1:0);
    rows=[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    if(table==="campo_rapportini"&&!call.filters.some(f=>f[1]==="id"&&f[0]==="eq")){
      rows=rows.slice(0,2); // simulate a server limit lower than requested
      if(state.changeBetweenReads) rows=rows.map(r=>({...r,updated_at:"changed"}));
    }
    if(table==="order_employees") rows=rows.slice(0,2);
    // Project only requested fields, as the API does.
    const keys=call.selected.split(",").map(s=>s.trim());
    rows=rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>keys.includes(key))));
    return {data:rows,error:state.failure===table?new Error("API failed"):null,count};
  };
  const q={
    select:(value:string)=>{call.selected=value;return q;},
    eq:(column:string,value:unknown)=>{call.filters.push(["eq",column,value]);return q;},
    gt:(column:string,value:unknown)=>{call.filters.push(["gt",column,value]);return q;},
    in:(column:string,value:unknown)=>{call.filters.push(["in",column,value]);return q;},
    order:()=>q,limit:()=>q,
    maybeSingle:async()=>{const result=resolve();return {...result,data:state.missingTarget?null:result.data[0]??null};},
    then:(yes:(r:unknown)=>unknown,no:(e:unknown)=>unknown)=>Promise.resolve(resolve()).then(yes,no),
  };return q;
}}}));
const target:LaborReport={id:"a",company_id:"c",order_id:"A",user_id:"u",data_lavoro:"2026-09-24",stato:"inviato",updated_at:"version",ore_lavorate:4};
const employee={id:"e",user_id:"u",company_id:"c",first_name:"Mario",last_name:"Rossi",costo_orario:25};
const request={companyId:"c",orderId:"A",reportId:"a",showCosts:true};
beforeEach(()=>{state.reports=[target];state.employees=[employee];state.labor=[{id:"l",order_id:"A",cost_preventivo:500,total_cost:200}];state.calls=[];state.failure="";state.shortCount=false;state.changeBetweenReads=false;state.missingTarget=false;});
describe("Lettura e rivalidazione prima di approvare",()=>{
  it("legge tutte le pagine della giornata, anche con limite API ridotto",async()=>{
    state.reports=[target,...["b","c","d"].map(id=>({...target,id,user_id:"capo",presenze:[{employee_id:"e",ore:1}]}))];
    const result=await loadLaborReview(request);expect(result.overlaps).toHaveLength(3);
    expect(state.calls.filter(c=>c.table==="campo_rapportini").length).toBe(4);
    expect(result.budget).toEqual({planned:500,registered:200});expect(result.knownCost).toBe(100);
  });
  it("non seleziona paghe/tariffe o aggregati economici senza visibilità costi",async()=>{
    const result=await loadLaborReview({...request,showCosts:false});
    expect(state.calls.filter(c=>c.table==="employees").every(c=>!/(gross_salary|costo_orario|inps_rate|monthly_hours)/.test(c.selected))).toBe(true);
    expect(state.calls.some(c=>c.table==="order_employees")).toBe(false);
    expect(result.budget).toBeNull();expect(result.rows[0].rate).toBeNull();
  });
  it("tutte le query sono limitate all'azienda, e quelle del rapporto alla commessa",async()=>{
    await loadLaborReview(request);
    for(const call of state.calls)expect(call.filters).toContainEqual(["eq",call.table==="order_employees"?"order.company_id":"company_id","c"]);
    expect(state.calls[0].filters).toContainEqual(["eq","order_id","A"]);
  });
  it.each(["campo_rapportini","employees","order_employees"])("un errore %s impedisce la conferma",async table=>{
    state.failure=table;await expect(loadLaborReview(request)).rejects.toThrow("API failed");
  });
  it("non prende un'anagrafica parziale come controllo completo",async()=>{state.shortCount=true;await expect(loadLaborReview(request)).rejects.toThrow("Anagrafiche incomplete");});
  it("blocca il rapporto sparito o non autorizzato",async()=>{state.missingTarget=true;await expect(loadLaborReview(request)).rejects.toThrow("non disponibile");});
  it("blocca una modifica durante la lettura",async()=>{state.changeBetweenReads=true;await expect(loadLaborReview(request)).rejects.toThrow("cambiato durante");});
  it("ricontrolla le tariffe e richiede una nuova conferma se cambiano",async()=>{
    const initial=await loadLaborReview(request);state.employees=[{...employee,costo_orario:30}];
    await expect(recheckLaborApproval(request,initial.fingerprint,true)).rejects.toThrow("sono cambiati");
  });
  it("ricontrolla la comparsa di un altro rapportino",async()=>{
    const initial=await loadLaborReview(request);state.reports.push({...target,id:"b"});
    await expect(recheckLaborApproval(request,initial.fingerprint,true)).rejects.toThrow("sono cambiati");
  });
  it("ricontrolla variazioni del budget e del registrato",async()=>{
    const initial=await loadLaborReview(request);state.labor[0].total_cost=250;
    await expect(recheckLaborApproval(request,initial.fingerprint,true)).rejects.toThrow("sono cambiati");
  });
  it("una conferma omessa non supera gli avvisi",async()=>{
    state.reports.push({...target,id:"b"});const initial=await loadLaborReview(request);
    await expect(recheckLaborApproval(request,initial.fingerprint,false)).rejects.toThrow("conferma gli avvisi");
    await expect(recheckLaborApproval(request,initial.fingerprint,true)).resolves.toEqual(target);
  });
  it("senza cambiamenti restituisce la versione da usare nell'update condizionato",async()=>{
    const initial=await loadLaborReview(request);expect(await recheckLaborApproval(request,initial.fingerprint,false)).toEqual(target);
  });
});
