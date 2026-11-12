/**
 * Un ordine confermato si annulla finché non è arrivato niente (12/11/2026).
 *
 * Eliminando due ordini confermati e mai consegnati, la finestra rispondeva «usa l'annullamento»,
 * ma da «confermato» e «parziale» l'annullamento non c'era: nessuna via d'uscita.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prossimiStatiOda } from "@/lib/odaOrigine";

describe("Annullare un ordine al fornitore", () => {
  it("confermato o parziale, senza merce né DDT: si annulla", () => {
    expect(prossimiStatiOda("confermato", "documento", false)).toContain("annullato");
    expect(prossimiStatiOda("parziale", "email", false)).toContain("annullato");
  });

  it("con merce arrivata o un DDT, no: resta lo storico", () => {
    expect(prossimiStatiOda("confermato", "documento", true)).not.toContain("annullato");
    expect(prossimiStatiOda("parziale", "email", true)).not.toContain("annullato");
    // chi non sa se è arrivato qualcosa non apre l'annullamento
    expect(prossimiStatiOda("confermato", "email")).not.toContain("annullato");
  });

  it("bozza e inviato si annullano come prima; ricevuto e annullato sono la fine", () => {
    expect(prossimiStatiOda("bozza", "email", true)).toContain("annullato");
    expect(prossimiStatiOda("inviato", "email", true)).toContain("annullato");
    expect(prossimiStatiOda("ricevuto", "email", false)).toEqual([]);
    expect(prossimiStatiOda("annullato", "email", false)).toEqual([]);
  });

  it("la scheda dell'ordine passa se è arrivato qualcosa: DDT o quantità ricevute", () => {
    const scheda = readFileSync("src/pages/azienda/PurchaseOrderDetail.tsx", "utf8");
    expect(scheda).toContain("const arrivato = ddtList.length > 0 || items.some((i) => Number(i.quantity_received ?? 0) > 0);");
    expect(scheda).toContain("prossimiStatiOda(order.status, origine, arrivato)");
  });
});
