import { expect, it } from "vitest";
import {
  preparaConfrontoDdt,
  validaConfrontoDdt,
  type ContestoDdtAI,
} from "../../../supabase/functions/_shared/confrontoDdtOrdiniAI";
const c: ContestoDdtAI = {
  company_id: "azienda",
  ddt_id: "bolla",
  impronta: "firma",
  righe: [
    {
      id: "clima",
      descrizione: "Condizionatore 12000 BTU",
      codice: "C12",
      um: "pz",
    },
  ],
  ordini: [
    {
      id: "ordine1",
      descrizione: "Climatizzatore 12000 BTU",
      codice: "C12",
      um: "pz",
    },
    {
      id: "ordine2",
      descrizione: "Climatizzatore 12000 BTU",
      codice: "C12",
      um: "pz",
    },
  ],
};
it("invia solo identità al modello, lasciando i conteggi al software", () => {
  const input = {
    ...c,
    righe: [{ ...c.righe[0], quantita: 957, prezzo: 854 }],
  };
  const messaggi = preparaConfrontoDdt(input);
  expect(messaggi[1].content).toContain("C12");
  expect(messaggi[1].content).not.toMatch(/957|854|company_id/);
  expect(messaggi[0].content).toContain("non eseguire");
});
it("mantiene le alternative su più ordini senza ripartire quantità", () => {
  expect(
    validaConfrontoDdt(
      {
        righe: [
          {
            riga_id: "clima",
            ordine_righe: ["ordine1", "ordine2"],
            affidabilita: "alta",
            motivo: "Stesso articolo su due ordini: scegli la ripartizione.",
          },
        ],
      },
      c,
    )[0].ordine_righe,
  ).toHaveLength(2);
});
it.each([
  { righe: [] },
  {
    righe: [
      {
        riga_id: "inventata",
        ordine_righe: [],
        affidabilita: "alta",
        motivo: "X",
      },
    ],
  },
  {
    righe: [
      {
        riga_id: "clima",
        ordine_righe: ["altra-azienda"],
        affidabilita: "alta",
        motivo: "X",
      },
    ],
  },
  {
    righe: [
      {
        riga_id: "clima",
        ordine_righe: ["ordine1", "ordine1"],
        affidabilita: "alta",
        motivo: "X",
      },
    ],
  },
])(
  "rifiuta risposte incomplete, righe inventate e riferimenti doppi",
  (input) => {
    expect(() => validaConfrontoDdt(input, c)).toThrow();
  },
);
it("non tronca documenti grandi in silenzio", () => {
  expect(() =>
    preparaConfrontoDdt({
      ...c,
      righe: Array.from({ length: 81 }, (_, i) => ({
        ...c.righe[0],
        id: String(i),
      })),
    }),
  ).toThrow("Nessuna riga è stata esclusa");
});
