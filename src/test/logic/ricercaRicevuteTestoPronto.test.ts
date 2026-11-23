import { describe, expect, it } from "vitest";
import {
  corrispondeRicercaRicevute,
  corrispondeTestoPronto,
  terminiRicercaRicevute,
  testoRicercaRicevute,
} from "@/lib/fatturazione/ricercaRicevute";

/**
 * Il testo pronto (23/11/2026) deve dare esattamente gli stessi risultati del
 * confronto di prima: cambia solo QUANDO si normalizza, non COME si confronta.
 */
const righe: Array<Array<string | null>> = [
  ["BLUMATICA S.r.l.", "4025", "01234567890", null, null, null, null],
  ["Società Edile Àlpina Srl", "FPR 152/26", null, null, "consegna in cantiere", null, null],
  ["BLEMAR SRL", "70/2026", null, null, null, null, null, "C-065", "Scuola via Milano", "Via Garibaldi 12"],
  ["Enel Energia S.p.A.", "005483506154", null, null, null, null, null],
  ["F.lli Lazzaro SRL a socio unico", "32", null, null, null, "nota", "rettifica importo"],
];

const ricerche = [
  "BL", "BLUMATICA", "blumatica srl", "societa", "àlpina", "FPR152", "FPR 152", "fpr-152",
  "70/2026", "70", "C-065", "c065", "scuola milano", "garibaldi", "enel 0054", "lazzaro socio",
  "rettifica", "inesistente", "", "   ",
];

describe("il testo pronto della ricerca", () => {
  for (const q of ricerche) {
    it(`«${q}» trova le stesse fatture di prima`, () => {
      const termini = terminiRicercaRicevute(q);
      const prima = righe.map((r) => corrispondeRicercaRicevute(termini, r));
      const dopo = righe.map((r) => corrispondeTestoPronto(termini, testoRicercaRicevute(r)));
      expect(dopo).toEqual(prima);
    });
  }

  it("senza testo pronto non trova niente, ma una ricerca vuota trova tutto", () => {
    expect(corrispondeTestoPronto(terminiRicercaRicevute("blu"), undefined)).toBe(false);
    expect(corrispondeTestoPronto([], undefined)).toBe(true);
  });
});
