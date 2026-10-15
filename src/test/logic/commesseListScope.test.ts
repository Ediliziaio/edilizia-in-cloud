import {describe,expect,it,vi} from "vitest";
import {readAllOrderRows,orderMarginGroups,orderMarginKind,type OrderMarginRow} from "@/lib/orders/listScope";
import {parseOrderAdvancedFilters} from "@/lib/orders/advancedFilters";
const defaults = {dateFrom:"",dateTo:"",createdFrom:"",createdTo:"",orderSearch:"",includeStatuses:[] as string[],excludeStatuses:[] as string[],paymentStatus:"all" as const,amountMin:"",amountMax:"",salespersonId:"",laborIds:[] as string[]};
const margin = (id:string,cost:number,profit:number,percent:number):OrderMarginRow => ({id,preventivo_totale:100,consuntivo:cost,margine:profit,margine_perc:percent});
describe("Perimetro completo delle commesse",()=>{
  it("legge anche oltre il limite API e non scambia una pagina per il totale",async()=>{
    const dataset=Array.from({length:1237},(_,id)=>({id}));
    const read=vi.fn(async(from:number,to:number)=>({data:dataset.slice(from,to+1),error:null as Error|null}));
    const rows=await readAllOrderRows(read);
    expect(rows).toHaveLength(1237);expect(read.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
    expect(new Set(rows.map(r=>r.id)).size).toBe(1237);
  });
  it("un errore in una pagina successiva non diventa un totale parziale",async()=>{
    const error=new Error("database timeout");
    await expect(readAllOrderRows(async from=>from===0?{data:[1,2],error:null}:{data:null,error},2)).rejects.toBe(error);
  });
  it("separa negativi, bassi, costi assenti e soglia del 20% anche oltre pagina 1",()=>{
    const ids=Array.from({length:65},(_,i)=>String(i));
    const rows=ids.map(id=>margin(id,70,30,30));
    rows[21]=margin("21",110,-10,-10);rows[43]=margin("43",90,10,10);rows[62]=margin("62",0,100,100);
    rows[64]=margin("64",80,20,20);
    const groups=orderMarginGroups(ids,rows);
    expect(groups.negative_margin).toEqual(["21"]);expect(groups.low_margin).toEqual(["43"]);expect(groups.missing_costs).toEqual(["62"]);
    expect(groups.good).toContain("64");expect(Object.values(groups).flat()).toHaveLength(65);
  });
  it("dati mancanti o non numerici non producono un falso margine sano",()=>{
    expect(orderMarginKind()).toBe("missing_costs");expect(orderMarginKind({...margin("x",50,50,50),margine:NaN})).toBe("missing_costs");
  });
  it("ripristina i filtri avanzati dall’URL e scarta valori non validi",()=>{
    const value={...defaults,orderSearch:"commessa 42",includeStatuses:["status-ok"],paymentStatus:"overdue",amountMin:"100.5",dateFrom:"2026-10-01"};
    expect(parseOrderAdvancedFilters(JSON.stringify(value),defaults)).toEqual(value);
    expect(parseOrderAdvancedFilters("{no",defaults)).toEqual(defaults);
    expect(parseOrderAdvancedFilters('{"includeStatuses":["x),id.gt.0"],"paymentStatus":"wrong","dateFrom":"not-date"}',defaults)).toEqual(defaults);
  });
});
