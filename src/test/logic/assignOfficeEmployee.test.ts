import { beforeEach, describe, expect, it, vi } from "vitest";
import { assignOfficeEmployee } from "@/lib/orders/assignOfficeEmployee";
const { rpc } = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue({data:"row-id",error:null});});
describe("assegnazione senza lettura della tariffa",()=>{
 it("invia persona, commessa e ore, senza campi retributivi",async()=>{
  expect(await assignOfficeEmployee("order",{employeeId:"employee"},"phase",2)).toBe("row-id");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("commessa_assegna_persona",{p_order_id:"order",p_employee_id:"employee",p_user_id:null,p_phase_id:"phase",p_planned_hours:2});
 });
 it("collega l’account senza leggere l’anagrafica riservata dei dipendenti",async()=>{
  await assignOfficeEmployee("order",{userId:"user"});
  expect(rpc.mock.calls[0][1]).toMatchObject({p_employee_id:null,p_user_id:"user",p_planned_hours:null});
 });
 it.each([-1,NaN,Infinity])("blocca ore non valide %s prima della chiamata",async hours=>{
  await expect(assignOfficeEmployee("order",{employeeId:"employee"},null,hours)).rejects.toThrow("Ore previste non valide");expect(rpc).not.toHaveBeenCalled();
 });
 it("un rifiuto del server non diventa una falsa assegnazione riuscita",async()=>{
  rpc.mockResolvedValue({data:null,error:{message:"Non consentito"}});
  await expect(assignOfficeEmployee("order",{employeeId:"employee"})).rejects.toThrow("Non consentito");
 });
 it("una risposta incompleta non viene annunciata come riuscita",async()=>{
  rpc.mockResolvedValue({data:null,error:null});
  await expect(assignOfficeEmployee("order",{employeeId:"employee"})).rejects.toThrow("Assegnazione non confermata");
 });
});
