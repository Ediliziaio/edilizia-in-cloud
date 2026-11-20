import { describe,expect,it,vi } from "vitest";
import { providersAppuntamento } from "../../../supabase/functions/_shared/providersAppuntamento";
import { sincronizzaCalendariEsterni } from "../../../supabase/functions/_shared/appuntamentiPubblici";

const companyId="azienda",appointmentId="appuntamento",userId="admin";
const args={companyId,appointmentId,userId,azione:"push-event" as const};
type Riga = Record<string,unknown>;
function fixture(options: {binding?:string;member?:boolean;google?:boolean;apple?:boolean;mapping?:string;errore?:boolean}={}) {
  const requests:Array<{table:string;filters:Record<string,unknown>}>=[];
  const rows:Record<string,Riga[]>={
    appointments:[{id:appointmentId,company_id:companyId,calendar_id:"cal",booking_member_calendar_id:options.member?"member":null,assigned_to:"collega"}],
    marketing_calendars:[{id:"cal",company_id:companyId,owner_id:"collega",calendar_type:options.member?"team":"personal",external_provider:options.binding,external_connection_id:options.binding?"conn":null,external_calendar_id:options.binding?"external":null},
      {id:"member",company_id:companyId,owner_id:"collega",external_provider:"google",external_connection_id:"conn",external_calendar_id:"member-external"}],
    google_calendar_connections:options.google?[{id:"g",company_id:companyId,user_id:"collega",status:"connected"}]:[],
    apple_calendar_connections:options.apple?[{id:"a",company_id:companyId,user_id:"collega",status:"connected"}]:[],outlook_calendar_connections:[],
    google_calendar_event_map:options.mapping==="google"?[{id:"map",company_id:companyId,appointment_id:appointmentId}]:[],
    apple_calendar_event_map:options.mapping==="apple"?[{id:"map",company_id:companyId,appointment_id:appointmentId}]:[],appointment_outlook_links:[],
  };
  const db={from:(table:string)=>{
    const filters:Record<string,unknown>={};
    const q={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},limit:()=>q,maybeSingle:async()=>{
      requests.push({table,filters});
      return {data:(rows[table]??[]).find(r=>Object.entries(filters).every(([k,v])=>r[k]===v))??null,error:options.errore?new Error("lettura fallita"):null};
    }};return q;
  }};
  return {db,requests,rows};
}
describe("Provider degli appuntamenti pubblici",()=>{
  it("senza collegamenti non chiama servizi esterni",async()=>{
    const f=fixture();expect(await providersAppuntamento(f.db,args)).toEqual([]);
  });
  it("sceglie soltanto il provider agganciato, anche se il responsabile ne ha altri",async()=>{
    const f=fixture({binding:"google",apple:true});expect(await providersAppuntamento(f.db,args)).toEqual(["google"]);
  });
  it("in assenza di aggancio usa il responsabile, non l'amministratore che ha prenotato",async()=>{
    const f=fixture({google:true});expect(await providersAppuntamento(f.db,args)).toEqual(["google"]);
    expect(f.requests.filter(r=>r.table.endsWith("_connections")).every(r=>r.filters.user_id==="collega"&&r.filters.company_id===companyId)).toBe(true);
  });
  it("il calendario squadra usa il membro prenotato",async()=>{
    const f=fixture({member:true});expect(await providersAppuntamento(f.db,args)).toEqual(["google"]);
    expect(f.requests.some(r=>r.table==="marketing_calendars"&&r.filters.id==="member")).toBe(true);
  });
  it("cancella dal provider della mappa anche dopo il cambio di destinazione",async()=>{
    const f=fixture({binding:"google",mapping:"apple"});expect(await providersAppuntamento(f.db,{...args,azione:"delete-event"})).toEqual(["apple"]);
  });
  it("una mappa di altra azienda non viene inviata al provider",async()=>{
    const f=fixture({mapping:"apple"});f.rows.apple_calendar_event_map[0].company_id="altra";
    expect(await providersAppuntamento(f.db,{...args,azione:"delete-event"})).toEqual([]);
  });
  it("un errore di lettura non viene interpretato come assenza di collegamenti",async()=>{
    await expect(providersAppuntamento(fixture({errore:true}).db,args)).rejects.toThrow("lettura fallita");
  });
  it("il gestore reale non invia richieste ai provider mai configurati",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);vi.stubGlobal("Deno",{env:{get:()=>"synthetic-only"}});
    try {await sincronizzaCalendariEsterni(args,fixture().db);expect(fetcher).not.toHaveBeenCalled();}
    finally {vi.unstubAllGlobals();}
  });
  it("un 404 sul provider configurato resta visibile",async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>Response.json({error:"account da ricollegare"},{status:404}));
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
    vi.stubGlobal("fetch",fetcher);vi.stubGlobal("Deno",{env:{get:(k:string)=>k==="SUPABASE_URL"?"https://example.invalid":"synthetic-only"}});
    try {await sincronizzaCalendariEsterni(args,fixture({binding:"google"}).db);expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain("/google-calendar-sync");expect(warning).toHaveBeenCalledWith(expect.stringContaining("HTTP 404"));}
    finally {warning.mockRestore();vi.unstubAllGlobals();}
  });
});
