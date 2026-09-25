import { describe, expect, it } from "vitest";
import { planMaterial, pendingMaterials, procurementLines, type ProcurementCoverage, type ProcurementItem } from "@/lib/orders/materialProcurement";

const item: ProcurementItem = { id: "a", name: "Materiale", supplier_id: "s", quantity: 10, purchase_price: 12, vat_rate: 0, status: "da_ordinare" };
const row = (status: string, quantity = 4, received = 0): ProcurementCoverage => ({ id: status, order_item_id: "a", quantity, quantity_received: received, purchase_orders: { id: status, oda_number: status, status } });

describe("Materiali: quantità preventivate, bozze, ordini e ricezioni", () => {
  it("propone il fabbisogno non ancora coperto", () => expect(pendingMaterials([item], [])[0].quantity).toBe(10));
  it("riserva le bozze senza contarle come emesse o ricevute", () => {
    expect(planMaterial(item, [row("bozza", 4, 4)])).toMatchObject({ drafted: 4, issued: 0, received: 0, remaining: 6 });
  });
  it.each(["inviato", "confermato", "parziale", "ricevuto"])("considera quantità reali e non assume ricezione completa dallo stato %s", status => {
    expect(planMaterial(item, [row(status, 4, 2)])).toMatchObject({ drafted: 0, issued: 4, received: 2, remaining: 6 });
  });
  it("somma bozze e ordini senza sommare nuovamente il ricevuto", () => {
    expect(pendingMaterials([item], [row("bozza", 2), row("parziale", 4, 3)])[0].quantity).toBe(4);
  });
  it("riapre quantità di OdA annullati", () => expect(planMaterial(item, [row("annullato", 10, 5)])).toMatchObject({ covered: 0, received: 0, remaining: 10 }));
  it("non ricrea articoli completamente coperti", () => expect(pendingMaterials([item], [row("bozza", 10)])).toEqual([]));
  it("segnala sovraordine senza produrre residui negativi", () => expect(planMaterial(item, [row("inviato", 12)])).toMatchObject({ overOrdered: true, remaining: 0, canOrder: false }));
  it("non acquista articoli da giacenza", () => expect(pendingMaterials([{ ...item, stock_item_id: "stock" }], [])).toEqual([]));
  it.each(["installato", "in_magazzino", "ordinato"])("non ripropone uno stato %s senza copertura: richiede controllo", status => {
    expect(planMaterial({ ...item, status }, [])).toMatchObject({ canOrder: false, review: expect.any(String) });
  });
  it.each([0, -1, NaN, Infinity])("blocca quantità non valida %s", quantity => expect(planMaterial({ ...item, quantity }, [])).toMatchObject({ canOrder: false }));
  it("non classifica materiali o servizi usando parole nel nome", () => {
    expect(pendingMaterials([{ ...item, name: "Kit montaggio" }, { ...item, id: "b", name: "Posa acquistata" }], [])).toHaveLength(2);
  });
  it("gestisce decimali senza residui floating point", () => expect(planMaterial({ ...item, quantity: 0.3 }, [row("bozza", 0.1), row("inviato", 0.2)])).toMatchObject({ remaining: 0 }));
  it("non muta le quantità originali", () => { pendingMaterials([item], [row("bozza")]); expect(item.quantity).toBe(10); });
  it("non sottrae scatole, metri o kg da quantità prive di unità canonica", () => {
    expect(planMaterial(item, [{ ...row("inviato"), unit_of_measure: "scatole" }])).toMatchObject({ canOrder: false, review: expect.stringContaining("Unità di misura") });
  });
  it("ignora collegamenti di altri articoli", () => expect(planMaterial(item, [{ ...row("bozza"), order_item_id: "other" }]).remaining).toBe(10));
  it("segnala una distinta incoerente", () => expect(planMaterial({ ...item, posizioni: [{ descrizione: "finestra", quantita: 9 }] }, [])).toMatchObject({ canOrder: false, review: expect.stringContaining("distinta") }));
  it("blocca ricreazione della distinta parzialmente ordinata", () => expect(planMaterial({ ...item, posizioni: [{ descrizione: "finestra", quantita: 10 }] }, [row("bozza", 4)])).toMatchObject({ canOrder: false, review: expect.stringContaining("posizioni") }));
  it("mantiene una riga per posizione e l’IVA zero", () => {
    const lines = procurementLines([{ ...item, posizioni: [{ descrizione: "Finestra A", misure: "100x200", quantita: 2 }, { descrizione: "Finestra B", quantita: 8 }] }]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 2, vat_rate: 0, order_item_id: "a", description: "Materiale — Finestra A 100x200" });
  });
  it.each([-1, NaN, Infinity])("non crea costi non validi %s", purchase_price => expect(() => procurementLines([{ ...item, purchase_price }])).toThrow());
});
