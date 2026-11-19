import { describe, expect, it } from "vitest";
import { costiVociCollegati } from "@/lib/marginalita/costiVociCollegati";

describe("costi collegati alle voci", () => {
  it("distingue impegni e consumi, senza duplicare il materiale coperto da OdA", () => {
    const map = costiVociCollegati([{order_item_id:"a", quantity:10, line_total:120}], [
      {order_item_id:"a", movement_type:"scarico", quantity:10, unit_cost:12},
      {order_item_id:"a", movement_type:"carico", quantity:2, unit_cost:12, rientro_commessa:true},
      {order_item_id:"b", movement_type:"scarico", quantity:4, unit_cost:10},
      {order_item_id:"b", movement_type:"carico", quantity:1, unit_cost:10, rientro_commessa:true},
      {order_item_id:"b", movement_type:"carico", quantity:20, unit_cost:10, rientro_commessa:false},
    ]);
    expect(map.get("a")).toEqual({importo:96, fonte:"OdA emessi · impegno"});
    expect(map.get("b")).toEqual({importo:30, fonte:"Magazzino · consumo netto"});
    expect(map.has("senza-collegamenti")).toBe(false);
  });
  it("un consumo senza costo o un OdA senza prezzo non diventano un costo zero", () => {
    const map = costiVociCollegati([{order_item_id:"a", line_total:null}], [
      {order_item_id:"b", movement_type:"scarico", quantity:1, unit_cost:null},
    ]);
    expect(map.get("a")?.importo).toBeNull();
    expect(map.get("b")?.importo).toBeNull();
  });
});
