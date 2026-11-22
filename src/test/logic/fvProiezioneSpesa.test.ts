import { expect, it } from "vitest";
import { proiezioneSpesaFv } from "@/lib/fotovoltaico/proiezioneSpesa";

it("senza variazione usa 25 spese annuali, senza divisioni per zero", () => {
  expect(proiezioneSpesaFv(1800, 0)).toBe(45000);
});
it("conserva l'ipotesi del calcolo e supporta anche una riduzione dei prezzi", () => {
  expect(proiezioneSpesaFv(100, .025, 2)).toBe(203);
  expect(proiezioneSpesaFv(100, -.1, 2)).toBe(190);
});
it("non inventa un tasso per calcoli storici o dati non validi", () => {
  for (const tasso of [undefined, null, '0.025', NaN, Infinity, -1, 2])
    expect(proiezioneSpesaFv(1800, tasso)).toBeNull();
  expect(proiezioneSpesaFv(Infinity, .025)).toBeNull();
});
