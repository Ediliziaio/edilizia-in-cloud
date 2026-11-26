import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),calls:[] as Array<[string,...unknown[]]>,rows:[] as Array<{id:string;current_status_id:string;company_id:string}>,links:{} as Record<string,Array<Record<string,string>>>,error:null as Error|null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:mock.from,rpc:mock.rpc}}));
import {readOrdersPage,type OrdersReaderFilters} from "@/lib/orders/listQuery";
const filters:OrdersReaderFilters={companyId:"company-a",focusIds:null,paymentIds:null,salespersonFilter:"all",laborFilter:"all",supplierFilter:"all",sidebarFilters:{dateFrom:"",dateTo:"",createdFrom:"",createdTo:"",orderSearch:"",includeStatuses:[],excludeStatuses:[],paymentStatus:"all",amountMin:"",amountMax:"",salespersonId:"",laborIds:[]},customerFilter:"all",debouncedSearch:"",statusFilter:"all",supportStatusId:"support",lastStatusId:"done",hideCompleted:false,amountMin:"",amountMax:"",isYearCorrente:false,monthFilter:"all",currentYear:2026,hasSelectedYear:false,selectedYear:null,contractDateRange:{from:undefined,to:undefined},warehouseDateRange:{from:undefined,to:undefined},expectedDateRange:{from:undefined,to:undefined},sortField:"id",sortDir:"asc"};
beforeEach(()=>{
  mock.rpc.mockReset().mockImplementation(async (_name:string,args:{p_company_id:string;p_ids:string[]})=>({data:args.p_ids.map(id=>({id})),error:null as null}));
  mock.calls=[];mock.error=null;mock.links={};mock.rows=Array.from({length:65},(_,i)=>({id:String(i).padStart(3,"0"),current_status_id:i<30?"open":"risk",company_id:"company-a"}));
  mock.from.mockImplementation((table:string)=>{
    let rows:Array<Record<string,string>>=table==="orders"?[...mock.rows]:[...(mock.links[table]??[])],start=0,end=1000;
    const query={
      select:vi.fn((columns:string)=>{mock.calls.push(["select",columns]);return query;}),
      eq:vi.fn((key:string,value:string)=>{mock.calls.push(["eq",key,value]);rows=rows.filter(row=>row[key as keyof typeof row]===value);return query;}),
      is:vi.fn((key:string,value:unknown)=>{mock.calls.push(["is",key,value]);return query;}),
      in:vi.fn((key:string,ids:string[])=>{mock.calls.push(["in",key,ids]);rows=rows.filter(row=>ids.includes(row[key as keyof typeof row]));return query;}),
      or:vi.fn((espressione:string, options?:unknown)=>{mock.calls.push(options ? ["or",espressione,options] : ["or",espressione]);return query;}),gte:vi.fn().mockReturnThis(),lte:vi.fn().mockReturnThis(),
      lt:vi.fn((key:string,value:string)=>{mock.calls.push(["lt",key,value]);return query;}),
      order:vi.fn().mockReturnThis(),
      range:vi.fn((from:number,to:number)=>{mock.calls.push(["range",from,to]);start=from;end=to;return query;}),
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:mock.error?null:rows.slice(start,end+1),error:mock.error,count:rows.length})),
    };return query;
  });
});
describe("Filtri prima della paginazione delle commesse",()=>{
  it("esclude le commesse nelle altre pipeline prima di contare e paginare", async () => {
    const lettura = { ...filters, excludeOrderIds: ["000", "001", "042"] };
    const pagina = await readOrdersPage(lettura, 0, 9);
    expect(pagina.totalCount).toBe(62);
    expect(pagina.orders.map(r => r.id)).toEqual(["002", "003", "004", "005", "006", "007", "008", "009", "010", "011"]);
    expect((await readOrdersPage({ ...lettura, focusIds: ["001", "042", "043"] }, 0, Infinity)).orders.map(r => r.id)).toEqual(["043"]);
  });
  it("la data finale del mese usa la mezzanotte locale del giorno successivo", async () => {
    const contractDateRange = { from: new Date(2027, 9, 1), to: new Date(2027, 9, 31) };
    await readOrdersPage({ ...filters, monthFilter: "9", contractDateRange }, 0, 19);
    expect(mock.calls).toContainEqual(["lt", "created_at", new Date(2027, 10, 1).toISOString()]);
  });
  it("completa gli importi finanziari solo per le commesse della pagina e dell'azienda selezionata",async()=>{
    const result=await readOrdersPage(filters,20,39);
    expect(mock.rpc).toHaveBeenCalledWith("commesse_importi_finanziari",{p_company_id:"company-a",p_ids:result.orders.map(row=>row.id)});
    expect(result.orders).toHaveLength(20);
  });
  it("«Solo generali» tiene anche ciò che contengono; «Senza generale» toglie entrambe; di default nessun filtro",async()=>{
    await readOrdersPage({...filters,generaliFilter:"solo"},0,19);
    expect(mock.calls).toContainEqual(["or","workflow_kind.eq.generale,commessa_generale_id.not.is.null"]);
    mock.calls=[];
    await readOrdersPage({...filters,generaliFilter:"senza"},0,19);
    expect(mock.calls).toContainEqual(["or","workflow_kind.neq.generale"]);
    expect(mock.calls).toContainEqual(["or","commessa_generale_id.is.null"]);
    mock.calls=[];
    await readOrdersPage({...filters,generaliFilter:"all"},0,19);
    expect(mock.calls.filter(call=>call[0]==="or")).toEqual([]);
  });
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
    expect(mock.calls.filter(call=>call[0]==="in")).toEqual([["in","id",selected.slice(20,40)]]);
    expect(mock.calls.filter(call=>call[0]==="select").map(call=>call[1]==="id")).toEqual([true,false]);
    expect(mock.rpc).toHaveBeenCalledWith("commesse_importi_finanziari",{p_company_id:"company-a",p_ids:selected.slice(20,40)});
  });
  it("carica le sole righe filtrate per la pipeline anche con più di cento ID",async()=>{
    mock.rows=Array.from({length:300},(_,i)=>({id:String(i).padStart(3,"0"),current_status_id:"open",company_id:"company-a"}));
    const selected=mock.rows.filter((_,i)=>i%2===1).map(row=>row.id);
    const result=await readOrdersPage({...filters,focusIds:selected},0,Infinity);
    expect(result.totalCount).toBe(150);
    expect(result.orders.map(row=>row.id)).toEqual(selected);
    expect(mock.calls.filter(call=>call[0]==="in").map(call=>(call[2] as string[]).length)).toEqual([100,50]);
    expect(mock.rpc).toHaveBeenCalledWith("commesse_importi_finanziari",{p_company_id:"company-a",p_ids:selected});
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

describe("Cliente collegato nella ricerca Commesse", () => {
  it.each(["principale", "laterale"])("cerca il cognome attraverso il filtro %s prima di contare e paginare", async (filtro) => {
    const lettura = filtro === "principale"
      ? { ...filters, debouncedSearch: "Rossi" }
      : { ...filters, sidebarFilters: { ...filters.sidebarFilters, orderSearch: "Rossi" } };
    await readOrdersPage(lettura, 0, 19);
    const alias = filtro === "principale" ? "cliente_ricerca" : "cliente_filtro";
    expect(mock.calls.find(([operazione]) => operazione === "select")?.[1]).toContain(
      `${alias}:profiles!orders_customer_id_fkey()`,
    );
    expect(mock.calls).toContainEqual(["or", "first_name.ilike.%Rossi%,last_name.ilike.%Rossi%", { referencedTable: alias }]);
    const filtroCliente = mock.calls.findIndex(([op, exp]) => op === "or" && String(exp).includes(`${alias}.not.is.null`));
    expect(filtroCliente).toBeGreaterThan(-1);
    expect(filtroCliente).toBeLessThan(mock.calls.findIndex(([op]) => op === "range"));
    expect(mock.calls.filter(([op]) => op === "range")).toHaveLength(1);
    expect(mock.calls).toContainEqual(["eq", "company_id", "company-a"]);
    expect(mock.calls).toContainEqual(["is", "deleted_at", null]);
  });
});

it("mantiene fatturato, incassato e residuo della commessa a misura anche nell'export integrale", async () => {
  const creditiMisura = { fatturato: 610, incassato: 244, residuo: 366, scaduto: 0, documenti: [] as never[] };
  mock.rows = Array.from({ length: 150 }, (_, pos) => ({
    id: String(pos).padStart(3, "0"),
    current_status_id: "open",
    company_id: "company-a",
  }));
  mock.rpc.mockImplementation(async (_nome, { p_ids }: { p_ids: string[] }) => ({
    data: p_ids.map((id) => id === "120" ? {
      id, order_type: "appaltatore_lavoro", valorizzazione: "a_misura", crediti_misura: creditiMisura,
    } : { id }),
    error: null as null,
  }));
  const perimetro = { ...filters, focusIds: mock.rows.map(({ id }) => id) };
  const pagina = await readOrdersPage(perimetro, 120, 139);
  const exportCompleto = await readOrdersPage(perimetro, 0, Infinity);
  expect(pagina.orders[0]).toMatchObject({ id: "120", crediti_misura: creditiMisura });
  expect(exportCompleto.orders[120]).toMatchObject({ id: "120", crediti_misura: creditiMisura });
  mock.rpc.mockResolvedValue({ data: null, error: new Error("rete indisponibile") });
  await expect(readOrdersPage(perimetro, 0, Infinity)).rejects.toThrow(/Incassi e crediti non disponibili/);
});
