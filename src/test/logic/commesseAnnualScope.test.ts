import {describe,expect,it,vi} from "vitest";
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
import {currentManagementScope,orderEconomics,previousOrderReasons} from "@/lib/orders/annualScope";
import type {OrderWithDetails} from "@/lib/orderUtils";
const order=(id:string,year:number,status:string|null,paid=true):OrderWithDetails => ({
  id,created_at:`${year}-06-15T10:00:00Z`,current_status_id:status,total_amount:100,vat_rate:22,
  installments:[{position:1,type:"balance",amount:122,is_paid:paid}],
} as OrderWithDetails);
describe("Anno corrente e pregresso ancora da gestire",()=>{
  it("include tutte le commesse dell’anno, anche completate e saldate; esclude quelle future",()=>{
    const rows=[order("current-done",2026,"done"),order("current-open",2026,"open"),order("future",2027,"open")];
    expect(currentManagementScope(rows,2026,"done","support",new Set()).map(row=>row.id)).toEqual(["current-done","current-open"]);
  });
  it("recupera vecchie commesse per lavori, stato assistenza, ticket indipendente o saldo",()=>{
    const rows=[order("work",2025,"open"),order("support",2024,"support"),order("ticket",2023,"done"),order("unpaid",2025,"done",false),order("archived",2025,"done")];
    expect(currentManagementScope(rows,2026,"done","support",new Set(["ticket"])).map(row=>row.id)).toEqual(["work","support","ticket","unpaid"]);
  });
  it("conta una sola volta la commessa anche con più motivi",()=>{
    const row=order("multi",2025,"open",false);
    expect(previousOrderReasons(row,2026,"done","support",new Set(["multi"]))).toEqual(["Lavori aperti","Assistenza aperta","Saldo da incassare"]);
    expect(currentManagementScope([row],2026,"done","support",new Set(["multi"]))).toHaveLength(1);
  });
  it("mantiene le commesse senza stato anche se manca una fase assistenza",()=>{
    expect(currentManagementScope([order("unknown",2025,null)],2026,"done",null,new Set())).toHaveLength(1);
  });
  it("cambia anno automaticamente a gennaio senza perdere il lavoro precedente",()=>{
    const rows=[order("paid",2026,"done"),order("work",2026,"open"),order("new",2027,"done")];
    expect(currentManagementScope(rows,2027,"done","support",new Set()).map(row=>row.id)).toEqual(["work","new"]);
  });
  it("tiene separati importi annuali e residui pregressi usando le rate reali",()=>{
    const annual=orderEconomics([order("annual",2026,"done")]);
    const previous=orderEconomics([order("previous",2025,"done",false)]);
    expect(annual).toEqual({count:1,sold:122,collected:122,pending:0});
    expect(previous).toEqual({count:1,sold:122,collected:0,pending:122});
  });
});
