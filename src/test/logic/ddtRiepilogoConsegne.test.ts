import { expect, it } from "vitest";
import {
  riepilogoQuantitaDDT,
  destinazioneConsegneDDT,
  magazziniConsegneDDT,
  type ConsegnaRiepilogo,
} from "@/lib/ddt/riepilogoConsegne";
const consegne: ConsegnaRiepilogo[] = [
  {
    tipo: "ingresso",
    destinazione: "cantiere",
    quantita: 2.5,
    unita_misura: "mq",
  },
  {
    tipo: "ingresso",
    destinazione: "magazzino",
    quantita: 3.25,
    unita_misura: "mq",
    warehouses: { name: "Principale" },
  },
];
it("elenco ed export mostrano le quote effettive invece della somma 308 della testata", () => {
  const d = {
    ricezione_esplicita: true,
    quantita_ricevuta: 308,
    destinazione: "cantiere",
    consegne,
  };
  expect(riepilogoQuantitaDDT(d)).toBe("Cantiere: 2,5 mq · Magazzino: 3,25 mq");
  expect(destinazioneConsegneDDT(d)).toBe("Cantiere e magazzino");
  expect(magazziniConsegneDDT(d)).toBe("Principale");
});
it("un documento appena acquisito non dichiara merce già ricevuta", () => {
  expect(
    riepilogoQuantitaDDT({
      ricezione_esplicita: true,
      quantita_ricevuta: 308,
      consegne: [],
    }),
  ).toBe("Consegne da confermare");
});
it("mantiene distinte unità, resi e servizi", () => {
  expect(
    riepilogoQuantitaDDT({
      ricezione_esplicita: true,
      consegne: [
        ...consegne,
        {
          tipo: "reso",
          destinazione: "magazzino",
          quantita: 1,
          unita_misura: "pz",
        },
        {
          tipo: "servizio",
          destinazione: "cantiere",
          quantita: 2,
          unita_misura: "ore",
        },
      ],
    }),
  ).toBe(
    "Cantiere: 2,5 mq · Magazzino: 3,25 mq · Reso Magazzino: 1 pz · Servizi: 2 ore",
  );
});
it("conserva le quantità legacy e chiarisce una consegna diretta senza magazzino", () => {
  expect(riepilogoQuantitaDDT({ quantita_ricevuta: 5 })).toBe("5");
  expect(
    magazziniConsegneDDT({
      destinazione: "cantiere",
      warehouses: { name: "Dato legacy" },
    }),
  ).toBe("Consegna diretta in cantiere");
});
