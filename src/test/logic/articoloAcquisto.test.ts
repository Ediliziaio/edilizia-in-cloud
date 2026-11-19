import { describe, it, expect } from "vitest";
import { valoriArticoloAcquisto } from "@/lib/orders/articoloAcquisto";
import { totaliRigheOda } from "@/lib/orders/articoloAcquisto";
import { totaliNuovoOda, rigaLibera } from "@/lib/orders/nuovoOdaCommessa";
describe("Articoli negli ordini di acquisto", () => {
  it("usa solo il costo di acquisto", () => {
    expect(
      valoriArticoloAcquisto({
        standard_cost: 18,
        unit_of_measure: "mq",
        vat_rate: 10,
      }),
    ).toEqual({ unit_price: 18, unit_of_measure: "mq", vat_rate: 10 });
  });
  it("non tratta il prezzo di vendita come costo mancante", () => {
    expect(
      valoriArticoloAcquisto({
        standard_cost: 0,
        unit_of_measure: "pz",
        vat_rate: 22,
      }).unit_price,
    ).toBe(0);
  });
  it("mantiene IVA zero e usa il default solo quando manca", () => {
    expect(
      valoriArticoloAcquisto({ standard_cost: 1, vat_rate: 0 }).vat_rate,
    ).toBe(0);
    expect(
      valoriArticoloAcquisto({ standard_cost: 1, vat_rate: null }).vat_rate,
    ).toBe(22);
  });
});

it("anteprima e documento ODA sommano le colonne arrotondate di ogni riga", () => {
  const righe = [
    { quantity:3, unit_price:0.0084, vat_rate:22, discount_percent:0 },
    { quantity:3, unit_price:0.0084, vat_rate:10, discount_percent:0 },
  ];
  // Netto 0,03 + 0,03; IVA 0,01 + 0,00, come le colonne SQL generate.
  expect(totaliRigheOda(righe)).toEqual({imponibile:0.06,iva:0.01,totale:0.07,daConfermare:0});
  expect(totaliNuovoOda(righe.map((r,i)=>({...rigaLibera(String(i)),...r,price_pending:false})))).toEqual({imponibile:0.06,iva:0.01,totale:0.07});
});

it("totali solo delle righe con prezzo concordato", async () => {
  const { totaliRigheOda } = await import("@/lib/orders/articoloAcquisto");
  expect(
    totaliRigheOda([
      {
        quantity: 40,
        unit_price: 0,
        discount_percent: 0,
        vat_rate: 10,
        price_pending: true,
      },
      { quantity: 2, unit_price: 10, discount_percent: 0, vat_rate: 22 },
    ]),
  ).toEqual({ imponibile: 20, iva: 4.4, totale: 24.4, daConfermare: 1 });
});
