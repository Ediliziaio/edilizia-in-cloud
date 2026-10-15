import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({from:vi.fn(),calls:[] as Array<[string,...unknown[]]>,rows:[] as Array<{id:string;current_status_id:string;company_id:string}>,links:{} as Record<string,Array<Record<string,string>>>,error:null as Error|null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:mock.from}}));
import {readOrdersPage,type OrdersReaderFilters} from "@/lib/orders/listQuery";
const filters:OrdersReaderFilters={companyId:"company-a",focusIds:null,paymentIds:null,salespersonFilter:"all",laborFilter:"all",supplierFilter:"all",sidebarFilters:{dateFrom:"",dateTo:"",createdFrom:"",createdTo:"",orderSearch:"",includeStatuses:[],excludeStatuses:[],paymentStatus:"all",amountMin:"",amountMax:"",salespersonId:"",laborIds:[]},customerFilter:"all",debouncedSearch:"",statusFilter:"all",supportStatusId:"support",lastStatusId:"done",hideCompleted:false,amountMin:"",amountMax:"",isYearCorrente:false,monthFilter:"all",currentYear:2026,hasSelectedYear:false,selectedYear:null,contractDateRange:{from:undefined,to:undefined},warehouseDateRange:{from:undefined,to:undefined},expectedDateRange:{from:undefined,to:undefined},sortField:"id",sortDir:"asc"};
beforeEach(()=>{
  mock.calls=[];mock.error=null;mock.links={};mock.rows=Array.from({length:65},(_,i)=>({id:String(i).padStart(3,"0"),current_status_id:i<30?"open":"risk",company_id:"company-a"}));
  mock.from.mockImplementation((table:string)=>{
    let rows:Array<Record<string,string>>=table==="orders"?[...mock.rows]:[...(mock.links[table]??[])],start=0,end=1000;
    const query={
      select:vi.fn().mockReturnThis(),
      eq:vi.fn((key:string,value:string)=>{mock.calls.push(["eq",key,value]);rows=rows.filter(row=>row[key as keyof typeof row]===value);return query;}),
      is:vi.fn().mockReturnThis(),
      in:vi.fn((key:string,ids:string[])=>{mock.calls.push(["in",key,ids]);rows=rows.filter(row=>ids.includes(row[key as keyof typeof row]));return query;}),
      or:vi.fn().mockReturnThis(),gte:vi.fn().mockReturnThis(),lte:vi.fn().mockReturnThis(),
      order:vi.fn().mockReturnThis(),
      range:vi.fn((from:number,to:number)=>{mock.calls.push(["range",from,to]);start=from;end=to;return query;}),
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:mock.error?null:rows.slice(start,end+1),error:mock.error,count:rows.length})),
    };return query;
  });
});
describe("Filtri prima della paginazione delle commesse",()=>{
  it("usa il perimetro annuale completo prima di contare, paginare ed esportare",async()=>{
    const scoped={...filters,isYearCorrente:true,periodIds:["004","023","064"]};
    expect((await readOrdersPage(scoped,0,1)).orders.map(row=>row.id)).toEqual(["004","023"]);
    expect((await readOrdersPage(scoped,0,Infinity)).totalCount).toBe(3);
  });
  it("filtra l’assistenza anche per ticket aperti su lavori completati",async()=>{
    const result=await readOrdersPage({...filters,statusFilter:"__assistenza__",supportOrderIds:["043","062"]},0,19);
    expect(result.orders.map(row=>row.id)).toEqual(["043","062"]);
  });
  it("non sostituisce un perimetro annuale non disponibile con una lista parziale",async()=>{
    await expect(readOrdersPage({...filters,isYearCorrente:true},0,19)).rejects.toThrow("Perimetro annuale non disponibile");
  });
  it("trova gli stati anche fuori dalle prime venti righe e conta tutti i risultati",async()=>{
    const result=await readOrdersPage({...filters,sidebarFilters:{...filters.sidebarFilters,includeStatuses:["risk"]}},0,19);
    expect(result.totalCount).toBe(35);expect(result.orders).toHaveLength(20);expect(result.orders[0].id).toBe("030");
    expect(mock.calls.findIndex(call=>call[0]==="in")).toBeLessThan(mock.calls.findIndex(call=>call[0]==="range"));
    expect(mock.calls).toContainEqual(["eq","company_id","company-a"]);
  });
  it("combina margini e pagamenti prima di contare e paginare",async()=>{
    const result=await readOrdersPage({...filters,focusIds:["021","043","062"],paymentIds:["043","062"]},0,19);
    expect(result.totalCount).toBe(2);expect(result.orders.map(row=>row.id)).toEqual(["043","062"]);
  });
  it("non interroga altre commesse quando il filtro non ha corrispondenze",async()=>{
    mock.from.mockClear();expect(await readOrdersPage({...filters,focusIds:[]},0,19)).toEqual({orders:[],totalCount:0});expect(mock.from).not.toHaveBeenCalled();
  });
  it("pipeline ed export usano gli stessi filtri, leggendo tutte le pagine",async()=>{
    const result=await readOrdersPage({...filters,sidebarFilters:{...filters.sidebarFilters,includeStatuses:["risk"]}},0,Infinity);
    expect(result.orders).toHaveLength(35);expect(result.totalCount).toBe(35);
  });
  it("gestisce molti id senza creare URL IN troppo grandi",async()=>{
    mock.rows=Array.from({length:750},(_,i)=>({id:String(i).padStart(3,"0"),current_status_id:"open",company_id:"company-a"}));
    const selected=mock.rows.filter((_,i)=>i%2===1).map(row=>row.id);
    const result=await readOrdersPage({...filters,focusIds:selected},20,39);
    expect(result.totalCount).toBe(375);expect(result.orders).toHaveLength(20);expect(result.orders[0].id).toBe("041");
    expect(mock.calls.some(call=>call[0]==="in")).toBe(false);
  });
  it("risolve separatamente dipendenti e squadre senza confondere le colonne",async()=>{
    mock.links.order_employees=[{id:"link-e",employee_id:"e1",order_id:"043"}];
    mock.links.order_external_teams=[{id:"link-t",external_team_id:"t1",order_id:"062"}];
    expect((await readOrdersPage({...filters,laborFilter:"emp-e1"},0,19)).orders.map(row=>row.id)).toEqual(["043"]);
    expect((await readOrdersPage({...filters,laborFilter:"team-t1"},0,19)).orders.map(row=>row.id)).toEqual(["062"]);
  });
  it("i filtri avanzati combinano più dipendenti e squadre sull’intero elenco",async()=>{
    mock.links.order_employees=[{id:"link-e",employee_id:"e1",order_id:"043"}];
    mock.links.order_external_teams=[{id:"link-t",external_team_id:"t1",order_id:"062"}];
    const result=await readOrdersPage({...filters,sidebarFilters:{...filters.sidebarFilters,laborIds:["emp-e1","team-t1"]}},0,19);
    expect(result.totalCount).toBe(2);expect(result.orders.map(row=>row.id)).toEqual(["043","062"]);
  });
  it("propaga un errore invece di mostrare un elenco vuoto",async()=>{
    mock.error=new Error("timeout");await expect(readOrdersPage(filters,0,19)).rejects.toThrow("timeout");
  });
});
