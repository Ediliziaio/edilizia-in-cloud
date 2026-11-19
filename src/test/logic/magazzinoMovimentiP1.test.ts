import { describe, expect, it } from "vitest";
import { leggiQuantitaMovimento, erroreQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { returnCandidates, type ReturnMovement } from "@/lib/magazzino/resiCantiere";
import { movementAvailabilityError } from "@/hooks/warehouse/useMovementAvailability";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

const article = { id: "r", name: "Cemento", quantity: 20, stock_item_id: "s", unita_misura: "sacco" };
const stock = { id: "s", tracking_mode: "fungible", warehouse_id: "w", unita_misura: "sacco" };
const movement = (type: string, quantity: number, returned = false): ReturnMovement => ({ order_item_id: "r", stock_item_id: "s", movement_type: type, quantity, rientro_commessa: returned, notes: null });

describe("Quantità e disponibilità dei movimenti", () => {
  it("preserva decimali e virgole, rifiutando valori incompleti o non finiti", () => {
    expect(leggiQuantitaMovimento("0,75")).toBe(0.75);
    expect(leggiQuantitaMovimento("12.125")).toBe(12.125);
    for (const value of ["", "1abc", "Infinity", "NaN", "-2", "0", "1,2,3"]) expect(leggiQuantitaMovimento(value)).toBeNull();
  });
  it("il carico non è limitato dalla giacenza precedente, il prelievo non viene ridotto in silenzio", () => {
    expect(erroreQuantitaMovimento(100, false)).toBeNull();
    expect(erroreQuantitaMovimento(100, false, 8)).toContain("Disponibili 8");
    expect(erroreQuantitaMovimento(0.5, true)).toContain("intera");
  });
  it("somma le richieste duplicate dello stesso articolo prima del confronto", () => {
    const rows = [{ stockItemId: "s", quantity: 3 }, { stockItemId: "s", quantity: 3 }] as BatchScanEntry[];
    expect(movementAvailabilityError(rows, new Map([["s", { name: "Cemento", available: 5, unit: "sacco" }]]))).toContain("richiesti 6, utilizzabili 5");
    expect(movementAvailabilityError(rows, undefined)).toContain("verificare");
  });
});

describe("Resi da scarichi reali", () => {
  it("usa il prelevato e sottrae solo consumi approvati e resi tracciati", () => {
    const reports = [
      { stato: "approvato", materiali_usati: [{ order_item_id: "r", stock_item_id: "s", quantita: 3, unita: "sacco" }] },
      { stato: "bozza", materiali_usati: [{ order_item_id: "r", stock_item_id: "s", quantita: 9, unita: "sacco" }] },
    ];
    const result = returnCandidates([article], [movement("scarico", 10), movement("carico", 2, true), movement("carico", 50)], reports, [stock])[0];
    expect(result).toMatchObject({ usciti: 10, posati: 3, rientrati: 2, avanzano: 5, blocked: null });
  });
  it("non propone un reso per il solo ordinato e ignora le divisioni interne tra fasi", () => {
    expect(returnCandidates([article], [], [], [stock])).toEqual([]);
    expect(returnCandidates([article], [{ ...movement("scarico", 8), notes: "Divisione tra le fasi: prova" }], [], [stock])).toEqual([]);
  });
  it("riconosce le unità di confezione al plurale senza inventare conversioni", () => {
    expect(returnCandidates([{ ...article, unita_misura: "sacchi" }], [movement("scarico", 2)], [], [stock])[0].blocked).toBeNull();
  });
  it("mantiene visibili ma blocca i prelievi storici senza collegamento alla scheda", () => {
    const rows = returnCandidates([{ ...article, stock_item_id: null }], [movement("scarico", 10)], [], [stock]);
    expect(rows[0]).toMatchObject({ verified: false, usciti: 10, warehouseId: "w", blocked: expect.stringContaining("storico") });
  });
  it("non arrotonda frazioni e blocca seriali o unità incompatibili", () => {
    expect(returnCandidates([article], [movement("scarico", 0.5)], [], [stock])[0]).toMatchObject({ avanzano: 0.5, blocked: expect.stringContaining("non viene arrotondata") });
    expect(returnCandidates([article], [movement("scarico", 2)], [], [{ ...stock, tracking_mode: "serialized" }])[0].blocked).toContain("seriali");
    expect(returnCandidates([article], [movement("scarico", 2)], [], [{ ...stock, unita_misura: "kg" }])[0].blocked).toContain("Unità");
  });
});
