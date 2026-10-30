import { describe, expect, it } from "vitest";
import {
  erroreNuovoOda, rigaLibera, righeDagliArticoli, righeInOrdine, righePerDatabase, totaliNuovoOda,
} from "@/lib/orders/nuovoOdaCommessa";

const articoli = [
  { id: "a1", name: "Mattoni forati", quantity: 200, purchase_price: 0.8, vat_rate: 22, supplier_id: "s1", unita_misura: "pz" },
  { id: "a2", name: "Malta M5", quantity: 10, purchase_price: 6, vat_rate: 22, supplier_id: "s2", unita_misura: "Sacchi" },
  { id: "a3", name: "Rete", quantity: 0, purchase_price: 3, supplier_id: null as string | null },
];

describe("ordine d'acquisto dalla commessa", () => {
  it("gli articoli da comprare diventano righe; spuntate solo quelle del fornitore scelto", () => {
    const r = righeDagliArticoli(articoli, "s1");
    expect(r.map((x) => [x.order_item_id, x.scelta, x.unit_of_measure])).toEqual([["a1", true, "pz"], ["a2", false, "sacchi"]]);
    expect(righeDagliArticoli(articoli, null).every((x) => !x.scelta)).toBe(true);
  });

  it("nell'ordine entrano le righe libere e gli articoli spuntati; totali con l'IVA", () => {
    const righe = [...righeDagliArticoli(articoli, "s1"), { ...rigaLibera("l1"), description: "Noleggio betoniera", quantity: 2, unit_price: 50, vat_rate: 22 }];
    expect(righeInOrdine(righe).map((x) => x.description)).toEqual(["Mattoni forati", "Noleggio betoniera"]);
    expect(totaliNuovoOda(righe)).toEqual({ imponibile: 260, iva: 57.2, totale: 317.2 });
  });

  it("dice cosa manca prima di creare", () => {
    const righe = righeDagliArticoli(articoli, "s1");
    expect(erroreNuovoOda({ fornitore: null, origine: "email", righe })).toMatch(/fornitore/);
    expect(erroreNuovoOda({ fornitore: "s1", origine: null, righe })).toMatch(/come lo ordini/);
    expect(erroreNuovoOda({ fornitore: "s3", origine: "email", righe: righeDagliArticoli(articoli, "s3") })).toMatch(/almeno una riga/);
    expect(erroreNuovoOda({ fornitore: "s1", origine: "email", righe: [rigaLibera("x")] })).toMatch(/descrizione/);
    expect(erroreNuovoOda({ fornitore: "s1", origine: "email", righe: [{ ...rigaLibera("x"), description: "Sabbia", quantity: 0 }] })).toMatch(/quantità/);
    expect(erroreNuovoOda({ fornitore: "s1", origine: "email", righe: [{ ...rigaLibera("x"), description: "Sabbia", quantity: NaN }] })).toMatch(/quantità/);
    expect(erroreNuovoOda({ fornitore: "s1", origine: "email", righe })).toBeNull();
  });

  it("le righe per il database tengono il legame con l'articolo e l'ordine", () => {
    const righe = [...righeDagliArticoli(articoli, "s1"), { ...rigaLibera("l1"), description: " Sabbia ", quantity: 3, unit_price: 20 }];
    expect(righePerDatabase(righe, "co", "po")).toEqual([
      { company_id: "co", purchase_order_id: "po", order_item_id: "a1", description: "Mattoni forati", quantity: 200, unit_of_measure: "pz", unit_price: 0.8, vat_rate: 22, discount_percent: 0, sort_order: 0 },
      { company_id: "co", purchase_order_id: "po", order_item_id: null, description: "Sabbia", quantity: 3, unit_of_measure: "pz", unit_price: 20, vat_rate: 22, discount_percent: 0, sort_order: 1 },
    ]);
  });
});
