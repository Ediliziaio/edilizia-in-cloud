import { describe, expect, it, vi } from "vitest";
import { syncGoogleBusySlots, sameBusySlot, type GoogleBusySlot } from "../../../supabase/functions/_shared/googleBusySlots";
import { calendarMidnight } from "../../../supabase/functions/_shared/calendarTime";

const scope = { companyId: "company", userId: "user",connectionId:"connection", calendarIds: ["primary"], accessToken: "test-token", timeMin: "2026-10-01T00:00:00Z", timeMax: "2026-12-01T00:00:00Z" };
const slot = (id = "event", calendar = "primary"): GoogleBusySlot & { id: string } => ({ id: "slot-"+id, company_id: "company", user_id: "user", google_event_id: id, google_calendar_id: calendar, summary: "Busy", start_at: "2026-10-13T10:00:00Z", end_at: "2026-10-13T11:00:00Z", is_all_day: false });
const event = (id = "event") => ({ id, summary: "Busy", start: { dateTime: "2026-10-13T12:00:00+02:00" }, end: { dateTime: "2026-10-13T13:00:00+02:00" } });
function database(initial: ReturnType<typeof slot>[] = [], fail?: "read"|"write"|"delete") {
  const rows = initial.map(row => ({ ...row }));
  const calls: any[] = [];
  const leases=new Map<string,{token:string;expires:number}>();
  const rpcCalls: any[]=[];
  return { rows,calls,leases,rpcCalls,rpc:(name:string,p:any)=>{
    const q:any={abortSignal:()=>q,then:(resolve:(v:any)=>void)=>{
      rpcCalls.push({name,p});
      const key=JSON.stringify([p.p_company,p.p_user,p.p_calendar]);
      const held=leases.get(key);
      if(name==="gcal_busy_claim"){
        if(held&&held.expires>Date.now())return resolve({data:false,error:null});
        leases.set(key,{token:p.p_owner,expires:Date.now()+90_000});return resolve({data:true,error:null});
      }
      if(name==="gcal_busy_release"){
        if(held?.token===p.p_owner)leases.delete(key);return resolve({data:null,error:null});
      }
      if(!held||held.token!==p.p_owner||held.expires<=Date.now())return resolve({data:null,error:{message:"lease lost"}});
      const op=p.p_rows.length?"write":"delete";
      const filters:[[string,string],[string,string],[string,string]]=[["company_id",p.p_company],["user_id",p.p_user],["google_calendar_id",p.p_calendar]];
      calls.push({op,filters,data:p.p_rows});
      if(fail===op)return resolve({data:null,error:{message:"failure"}});
      for(const value of p.p_rows){
        const existing=rows.find(r=>r.company_id===value.company_id&&r.user_id===value.user_id&&r.google_calendar_id===value.google_calendar_id&&r.google_event_id===value.google_event_id);
        if(existing)Object.assign(existing,value);else rows.push({id:"slot-"+value.google_calendar_id+"-"+value.google_event_id,...value});
      }
      let removed=0;
      for(let i=rows.length-1;i>=0;i--)if(filters.every(([k,v])=>(rows[i] as any)[k]===v)&&p.p_remove.includes(rows[i].id)){rows.splice(i,1);removed++}
      return resolve({data:{written:p.p_rows.length,removed},error:null});
    }};return q;
  },from: (table: string) => {
    let op = "read", data: GoogleBusySlot[] = [], from = 0, to = Infinity;
    const filters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    const chain: any = {
      select: () => chain, order: () => chain, abortSignal: () => chain,
      range: (a: number, b: number) => { from=a; to=b; return chain; },
      eq: (key: string, value: unknown) => { filters.push([key,value]); return chain; },
      in: (key: string, value: unknown[]) => { inFilters.push([key,value]); return chain; },
      delete: () => { op="delete"; return chain; },
      upsert: (value: GoogleBusySlot[]) => { op="write"; data=value; return chain; },
      then: (resolve: (v: any) => void) => {
        calls.push({ table,op,filters,inFilters,data });
        if(fail===op) return resolve({ data:null,error:{ message:"failure" } });
        const matches = (row: any) => filters.every(([k,v]) => row[k]===v) && inFilters.every(([k,v]) => v.includes(row[k]));
        if(op==="read") return resolve({ data:rows.filter(matches).slice(from,to+1),error:null });
        if(op==="write") for(const value of data){
          const existing=rows.find(row=>row.company_id===value.company_id&&row.user_id===value.user_id&&row.google_event_id===value.google_event_id);
          if(existing) Object.assign(existing,value); else rows.push({ id:"slot-"+value.google_event_id,...value });
        }
        if(op==="delete") for(let i=rows.length-1;i>=0;i--) if(matches(rows[i])) rows.splice(i,1);
        return resolve({ data:null,error:null });
      },
    };return chain;
  }};
}
const google = (items: unknown[] = [], extra = {}) => vi.fn().mockResolvedValue(Response.json({ items,...extra }));

describe("busy slot reconciliation without redundant writes", () => {
  it("compares timestamps as instants, not timezone string representations",()=>{
    expect(sameBusySlot(slot(),{...slot(),start_at:"2026-10-13T12:00:00+02:00",end_at:"2026-10-13T13:00:00+02:00"})).toBe(true);
  });
  it("does not write unchanged events",async()=>{
    const db=database([slot()]); const result=await syncGoogleBusySlots(db,scope,google([event()]));
    expect(result).toEqual({pulled:1,written:0,removed:0,failedCalendars:[]});
    expect(db.calls.filter(x=>x.op!=="read")).toHaveLength(0);
  });
  it("500 events require 5 bounded writes instead of 500",async()=>{
    const db=database();
    const events=Array.from({length:500},(_,i)=>event("e"+i));
    const send=vi.fn().mockResolvedValueOnce(Response.json({items:events.slice(0,250),nextPageToken:"next"}))
      .mockResolvedValueOnce(Response.json({items:events.slice(250)}));
    const result=await syncGoogleBusySlots(db,scope,send);
    expect(result.written).toBe(500);
    expect(send).toHaveBeenCalledTimes(2);
    expect(db.calls.filter(x=>x.op==="write")).toHaveLength(5);
    expect(db.calls.filter(x=>x.op==="write").every(x=>x.data.length<=100&&x.data.every((r:any)=>r.company_id===scope.companyId&&r.user_id===scope.userId))).toBe(true);
  });
  it("a failed Google read never removes existing busy slots",async()=>{
    const db=database([slot()]); const send=vi.fn().mockResolvedValue(new Response("unavailable",{status:503}));
    expect((await syncGoogleBusySlots(db,scope,send)).failedCalendars).toEqual(["primary"]);
    expect(db.calls).toHaveLength(0); expect(db.rows).toHaveLength(1);
  });
  it("a complete empty calendar only removes that user's slots in that calendar",async()=>{
    const db=database([slot(),slot("other","other-calendar"),{...slot("foreign"),company_id:"other-company"},{...slot("colleague"),user_id:"other-user"}]);
    const result=await syncGoogleBusySlots(db,scope,google());
    expect(result.removed).toBe(1); expect(db.rows).toHaveLength(3);
    expect(db.calls.find(x=>x.op==="delete").filters).toEqual([["company_id","company"],["user_id","user"],["google_calendar_id","primary"]]);
  });
  it("uses all Google pages before deciding what has disappeared",async()=>{
    const db=database([slot("a"),slot("b")]);
    const send=vi.fn().mockResolvedValueOnce(Response.json({items:[event("a")],nextPageToken:"next"})).mockResolvedValueOnce(Response.json({items:[event("b")]}));
    expect((await syncGoogleBusySlots(db,scope,send)).removed).toBe(0);
    expect(new URL(send.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next");
  });
  it("preserves every slot when a later page fails",async()=>{
    const db=database([slot("a"),slot("b")]);
    const send=vi.fn().mockResolvedValueOnce(Response.json({items:[event("a")],nextPageToken:"next"})).mockResolvedValueOnce(new Response("",{status:429}));
    expect((await syncGoogleBusySlots(db,scope,send)).failedCalendars).toEqual(["primary"]);
    expect(db.calls).toHaveLength(0);
  });
  it("bounds repeated pagination tokens without touching the database",async()=>{
    const db=database([slot()]);const send=google([event()],{nextPageToken:"same"});
    await syncGoogleBusySlots(db,scope,send);expect(send).toHaveBeenCalledTimes(2);expect(db.calls).toHaveLength(0);
  });
  it("bounds a continuously paginated Google snapshot before any database writes",async()=>{
    const db=database([slot()]);let page=0;
    const send=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({items:[event()],nextPageToken:"page-"+ ++page})));
    const result=await syncGoogleBusySlots(db,scope,send);
    expect(send).toHaveBeenCalledTimes(20);expect(result.failedCalendars).toEqual(["primary"]);expect(db.calls).toHaveLength(0);
  });
  it("reads past the PostgREST 1000-row page without erasing events on the next page",async()=>{
    const initial=Array.from({length:1500},(_,i)=>slot("e"+i));const db=database(initial);
    let page=0;
    const send=vi.fn().mockImplementation(()=>{
      const items=initial.slice(page*250,++page*250).map(row=>event(row.google_event_id));
      return Promise.resolve(Response.json({items,...(page<6?{nextPageToken:"page-"+page}:{})}));
    });
    const result=await syncGoogleBusySlots(db,scope,send);
    expect(result).toEqual({pulled:1500,written:0,removed:0,failedCalendars:[]});
    expect(db.calls).toHaveLength(2);expect(db.rows).toHaveLength(1500);
  });
  it("an exhausted sync budget stops without retrying or deleting slots",async()=>{
    const db=database([slot()]);const send=google();
    const now=vi.spyOn(Date,"now").mockReturnValueOnce(0).mockReturnValue(45_000);
    try {
      const result=await syncGoogleBusySlots(db,scope,send);
      expect(result.failedCalendars).toEqual(["primary"]);expect(send).not.toHaveBeenCalled();expect(db.calls).toHaveLength(0);
    } finally {now.mockRestore();}
  });
  it("does not erase a failed calendar when a different calendar is empty",async()=>{
    const db=database([slot(),slot("other","other-calendar")]);
    const send=vi.fn().mockResolvedValueOnce(new Response("",{status:503})).mockResolvedValueOnce(Response.json({items:[]}));
    const result=await syncGoogleBusySlots(db,{...scope,calendarIds:["primary","other-calendar"]},send);
    expect(result.failedCalendars).toEqual(["primary"]);expect(db.rows.map(x=>x.google_calendar_id)).toEqual(["primary"]);
  });
  it.each(["read","write"] as const)("%s failure cannot authorize cleanup",async fail=>{
    const db=database([slot("old")],fail);const result=await syncGoogleBusySlots(db,scope,google([event("new")]));
    expect(result.failedCalendars).toEqual(["primary"]);expect(db.calls.some(x=>x.op==="delete")).toBe(false);
  });
  it("preserves a stored event when its returned dates are malformed",async()=>{
    const db=database([slot()]);const result=await syncGoogleBusySlots(db,scope,google([{...event(),end:{dateTime:"bad"}}]));
    expect(result.removed).toBe(0);expect(db.rows).toHaveLength(1);
  });
  it("the same event ID can exist in two calendars without moving either copy",async()=>{
    const db=database([slot("event","other-calendar")]);
    const result=await syncGoogleBusySlots(db,scope,google([event()]));
    expect(result.failedCalendars).toEqual([]);expect(db.rows.map(x=>x.google_calendar_id)).toEqual(["other-calendar","primary"]);
  });
  it("removes cancelled/installation events but keeps all-day occupancy",async()=>{
    const db=database([slot("cancelled"),slot("posa")]);
    const result=await syncGoogleBusySlots(db,scope,google([{...event("cancelled"),status:"cancelled"},{...event("posa"),extendedProperties:{private:{eic_kind:"posa"}}},{id:"day",start:{date:"2026-10-13"},end:{date:"2026-10-14"}}]));
    expect(result.removed).toBe(2);expect(db.rows[0].is_all_day).toBe(true);
  });
  it("a concurrent sync is refused before contacting Google; retry after release succeeds",async()=>{
    const db=database();let finish!:(r:Response)=>void;
    const old=syncGoogleBusySlots(db,scope,vi.fn(()=>new Promise<Response>(r=>{finish=r})));
    await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
    const send=google([event("new")]);
    const deferred=await syncGoogleBusySlots(db,scope,send);
    expect(deferred.failedCalendars).toEqual([]);expect(deferred.deferredCalendars).toEqual(["primary"]);
    expect(send).not.toHaveBeenCalled();finish(Response.json({items:[]}));await old;
    expect((await syncGoogleBusySlots(db,scope,send)).written).toBe(1);expect(db.rows).toHaveLength(1);
  });
  it("an expired worker cannot write or delete after a successor takes the lease",async()=>{
    const db=database([slot("new")]);let finish!:(r:Response)=>void;
    const old=syncGoogleBusySlots(db,scope,vi.fn(()=>new Promise<Response>(r=>{finish=r})));
    await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
    const key=JSON.stringify([scope.companyId,scope.userId,"primary"]);
    db.leases.set(key,{token:"new-owner",expires:Date.now()+90_000});
    finish(Response.json({items:[]}));
    expect((await old).failedCalendars).toEqual(["primary"]);expect(db.rows).toHaveLength(1);
    expect(db.leases.get(key)?.token).toBe("new-owner");
  });
  it("free, declined and working-location events do not block availability",async()=>{
    const db=database([slot("free"),slot("declined"),slot("location")]);
    await syncGoogleBusySlots(db,scope,google([{...event("free"),transparency:"transparent"},
      {...event("declined"),attendees:[{self:true,responseStatus:"declined"}]},{...event("location"),eventType:"workingLocation"}]));
    expect(db.rows).toHaveLength(0);
  });
  it.each([['2026-10-13','2026-10-12T22:00:00.000Z'],['2026-12-13','2026-12-12T23:00:00.000Z']])("%s uses calendar-local midnight",(day,expected)=>{
    expect(calendarMidnight(day,"Europe/Rome")).toBe(expected);
  });
  it("all-day dates across DST preserve a 25-hour calendar day",async()=>{
    const db=database();await syncGoogleBusySlots(db,scope,google([{id:"day",start:{date:"2026-10-25"},end:{date:"2026-10-26"}}],{timeZone:"Europe/Rome"}));
    expect(Date.parse(db.rows[0].end_at)-Date.parse(db.rows[0].start_at)).toBe(25*3600_000);
    expect(calendarMidnight("2026-02-30","Europe/Rome")).toBeNull();
  });
});
