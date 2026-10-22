import { describe, expect, it } from "vitest";
import { planMaterial, procurementLines, unitaMateriale } from "@/lib/orders/materialProcurement";

describe("materiali con la loro unità di misura negli ordini", () => {
  const cavo = { id: "m1", name: "Cavo FS17 1x2,5", quantity: 733, purchase_price: 0.4, vat_rate: 22, unita_misura: "m" };

  it("la riga dell'ordine porta l'unità del materiale; senza unità resta «pz» come prima", () => {
    expect(procurementLines([cavo])[0].unit_of_measure).toBe("m");
    expect(procurementLines([{ ...cavo, unita_misura: null }])[0].unit_of_measure).toBe("pz");
    expect(unitaMateriale({ unita_misura: " M " })).toBe("m");
  });

  it("copertura in metri su un materiale in metri: niente avviso, residuo calcolato", () => {
    const plan = planMaterial(cavo, [{
      id: "p1", order_item_id: "m1", quantity: 500, quantity_received: 0, unit_of_measure: "m",
      purchase_orders: { id: "o", oda_number: "ODA-1", status: "inviato" },
    }]);
    expect(plan.review).toBeNull();
    expect(plan.remaining).toBe(233);
  });

  it("unità diverse tra ordine e materiale: da verificare, nessun residuo inventato", () => {
    const plan = planMaterial(cavo, [{
      id: "p1", order_item_id: "m1", quantity: 2, quantity_received: 0, unit_of_measure: "rotoli",
      purchase_orders: { id: "o", oda_number: "ODA-1", status: "inviato" },
    }]);
    expect(plan.review).toMatch(/Unità di misura/);
    expect(plan.canOrder).toBe(false);
  });
});
