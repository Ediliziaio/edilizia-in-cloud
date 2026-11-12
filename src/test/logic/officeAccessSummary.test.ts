import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";
import { officeAccessSummary } from "@/lib/users/officeAccessSummary";
const base = { ...DEFAULT_PERMISSIONS, permessi_dettagliati: true, can_view_orders: true, can_view_order_amounts: false };
describe("reparti sulla stessa commessa", () => {
  it("tecnico: modifica operativa, nessun dato economico o personale", () => {
    expect(officeAccessSummary({ ...base, can_edit_orders: true })).toMatchObject({ orders:true,editOrders:true,amounts:false,costs:false,margins:false,payroll:false,individualRates:false });
  });
  it("ordini: acquisti implica costi e lo spiega, senza aprire stipendi", () => {
    const s=officeAccessSummary({...base,can_manage_purchasing:true});
    expect(s.costs).toBe(true);expect(s.payroll).toBe(false);expect(s.warnings.join(" ")).toContain("acquisti");
  });
  it("commerciale: venduto non concede fatture, costi, margini o HR", () => {
    expect(officeAccessSummary({...base,can_view_order_amounts:true})).toMatchObject({amounts:true,costs:false,margins:false,payroll:false,invoices:false});
  });
  it("responsabile: costi e margini senza dati individuali", () => {
    expect(officeAccessSummary({...base,can_view_order_amounts:true,can_view_costs:true,can_view_margins:true})).toMatchObject({costs:true,margins:true,payroll:false,individualRates:false});
  });
  it("amministrazione HR: tariffe solo insieme ai costi", () => {
    expect(officeAccessSummary({...base,can_view_employees:true}).individualRates).toBe(false);
    expect(officeAccessSummary({...base,can_view_persone:true,can_view_costs:true,can_view_billing:true})).toMatchObject({payroll:true,individualRates:true,invoices:true});
  });
  it("non promette segretezza dei costi con venduto e margini visibili", () => {
    expect(officeAccessSummary({...base,can_view_order_amounts:true,can_view_margins:true}).warnings.join(" ")).toContain("ricavare i costi");
  });
  it("sola lettura e modalità distinta prevalgono sulla modifica", () => {
    expect(officeAccessSummary({...base,sola_lettura:true,can_edit_orders:true}).editOrders).toBe(false);
    expect(officeAccessSummary({...base,permessi_dettagliati:false}).editOrders).toBe(true);
    expect(officeAccessSummary(base).editOrders).toBe(false);
  });
  it("il solo assegnato è più stretto del magazzino", () => {
    const s=officeAccessSummary({...base,only_assigned:true,only_my_warehouse:true});
    expect(s.scope).toBe("Magazzini assegnati e proprie");expect(s.warnings.join(" ")).toContain("portafoglio CRM");
  });
});
