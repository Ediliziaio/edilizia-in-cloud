import {describe,it,expect,vi,beforeEach} from "vitest";
const state=vi.hoisted(()=>({slots:vi.fn(),book:vi.fn()}));
vi.mock("../../../supabase/functions/_shared/calendarioPrenotazione",()=>({slotLiberiCalendario:(...args:any[])=>state.slots(...args),prenotaSuCalendario:(...args:any[])=>state.book(...args)}));
import {fishCalendarTool} from "../../../supabase/functions/_shared/fishCalendarTools";
import {trovaContattoPerTelefono} from "../../../supabase/functions/_shared/ediliziaCustomerTools";
beforeEach(()=>{state.slots.mockReset();state.book.mockReset();});
describe("Fish uses the existing calendar booking engine",()=>{
 it("scopes availability to the selected company and calendar",async()=>{
  state.slots.mockResolvedValue({calendario:{id:"calendar-a"},slot:["10:30","14:00"]});
  const result=await fishCalendarTool({},"company-a","calendar-a","+3902000001","disponibilita",{data:"17/11/2026"});
  expect(result.slot).toEqual(["10:30","14:00"]);expect(state.slots).toHaveBeenCalledWith({},"calendar-a","2026-11-17",{companyId:"company-a"});
 });
 it("does not confirm a booking when the locked calendar reservation fails",async()=>{
  const db:any={from:()=>({select:()=>({eq:()=>({ilike:()=>({limit:async()=>({data:[]})})})})})};
  state.book.mockResolvedValue({ok:false,motivo:"non_libero",messaggio:"Questo orario è stato appena preso."});
  const result=await fishCalendarTool(db,"company-a","calendar-a","+3902000001","fissa_appuntamento",{data:"2026-11-17",ora:"10:30",motivo:"Sopralluogo"});
  expect(result.creato).toBe(false);expect(result.risposta).toContain("non è confermato");expect(state.book.mock.calls[0][1]).toMatchObject({companyId:"company-a",calendarId:"calendar-a",dataIso:"2026-11-17",ora:"10:30"});
 });
 it("does not identify a customer from a matching phone suffix alone",async()=>{
  const db=(rows:any[])=>({from:()=>({select:()=>({eq:()=>({ilike:()=>({limit:async()=>({data:rows})})})})})}) as any;
  expect(await trovaContattoPerTelefono(db([{id:"wrong",phone:"+1202000001"}]),"company-a","202000001","+3902000001")).toBeNull();
  expect(await trovaContattoPerTelefono(db([{id:"one",phone:"+3902000001"},{id:"two",phone:"+3902000001"}]),"company-a","202000001","+3902000001")).toBeNull();
 });
});
