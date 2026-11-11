import {describe,it,expect} from "vitest";
import {centralinoCalls,matchesCallParty} from "@/lib/centralinoCalls";
import {FISH_FLOW_PRESETS,fishFlowPrompt} from "@/lib/fishFlows";
describe("Unified switchboard history",()=>{
 it("uses the external caller for inbound calls and the called party for outbound calls",()=>{
  const rows=centralinoCalls([{id:"h",direction:"inbound",from_number:"+3902000001",to_number:"+3902000000",started_at:"2026-11-10T09:00:00Z"}],[{id:"a",direzione:"outbound",numero_chiamante:"+3902000000",numero_chiamato:"+3902000002",creato_il:"2026-11-10T10:00:00Z",trascrizione_json:[{role:"agent",message:"Buongiorno"}]}]);
  expect(rows.map(r=>r.id)).toEqual(["a","h"]);expect(rows[0].number).toBe("+3902000002");expect(rows[1].number).toBe("+3902000001");expect(rows[0].transcript).toHaveLength(1);
 });
 it("does not confuse customers sharing a switchboard number or matching suffixes",()=>{
  const [call]=centralinoCalls([{id:"h",direction:"inbound",from_number:"+3902000001",started_at:"2026-11-10T09:00:00Z",customer_id:"customer-a"}],[]);
  expect(matchesCallParty(call,{customerId:"customer-b",phone:"+3902000001"})).toBe(false);
  expect(matchesCallParty(call,{customerId:"customer-a"})).toBe(true);
  expect(matchesCallParty({...call,customerId:null},{phone:"+1 02000001"})).toBe(false);
 });
 it.each(FISH_FLOW_PRESETS)("keeps confirmation and callback requirements in $id",flow=>{
  const prompt=fishFlowPrompt(flow.id);expect(prompt).toMatch(/conferma esplicita|Dopo il sì/);expect(prompt).toContain("recapito completo");expect(flow.tools).toContain("assign_to_user");
 });
});
