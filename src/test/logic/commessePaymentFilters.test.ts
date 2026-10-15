import {describe,expect,it,vi} from "vitest";
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
import {matchesOrderPayment,orderPaymentTiming} from "@/lib/orders/listPayments";
import type {OrderWithDetails} from "@/lib/orderUtils";
const order=(isPaid=false,date="2026-10-10"):OrderWithDetails => ({id:"o",total_amount:100,vat_rate:0,deposit_amount:0,balance_amount:100,deposit_paid:false,balance_paid:false,installments:[{position:0,type:"balance",amount:100,is_paid:isPaid,expected_date:date}]} as unknown as OrderWithDetails);
describe("Stati di incasso della lista commesse",()=>{
  it("usa le rate vere anche quando le vecchie colonne non risultano pagate",()=>{
    expect(matchesOrderPayment(order(true),"paid")).toBe(true);expect(matchesOrderPayment(order(true),"pending")).toBe(false);
    expect(matchesOrderPayment(order(true),"overdue","2026-10-15")).toBe(false);
  });
  it("un pagamento futuro o senza data non diventa scaduto",()=>{
    expect(matchesOrderPayment(order(false,"2026-10-20"),"pending")).toBe(true);
    expect(matchesOrderPayment(order(false,"2026-10-20"),"overdue","2026-10-15")).toBe(false);
    expect(matchesOrderPayment(order(false,""),"overdue","2026-10-15")).toBe(false);
    expect(matchesOrderPayment(order(),"overdue","2026-10-15")).toBe(true);
    expect(matchesOrderPayment(order(false,"2026-10-15"),"overdue","2026-10-15")).toBe(false);
  });
  it("mostra il ritardo reale e ignora scadenze già saldate",()=>{
    expect(orderPaymentTiming(order(),new Date(2026,9,15))).toEqual({nextDate:"2026-10-10",overdueDays:5});
    expect(orderPaymentTiming(order(true),new Date(2026,9,15))).toEqual({nextDate:null,overdueDays:0});
  });
});
