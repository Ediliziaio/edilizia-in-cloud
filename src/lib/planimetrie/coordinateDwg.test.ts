import { describe, expect, it } from "vitest";
import { direzioniDistinteDwg, leggiQuoteDwg, ritaglioInCoordinateDwg, unitaCompatibiliDwg, validaRichiestaModelloDwg, type QuotaDwg } from "./coordinateDwg";

describe("coordinate della tavola DWG", () => {
  it("conserva l’origine CAD e converte la Y dell’immagine verso l’alto", () => {
    expect(ritaglioInCoordinateDwg([1000, 2000, 3000, 6000], { x: 25, y: 50, width: 50, height: 25 }))
      .toEqual([1500, 3000, 2500, 4000]);
  });

  it("respinge due piani con la stessa quota", () => {
    const rettangolo = [1000, 2000, 3000, 6000];
    expect(() => validaRichiestaModelloDwg({
      unita: 4, altezza: 270,
      piani: [{ nome: "Piano terra", quota: 0, rettangolo }, { nome: "Primo piano", quota: 0, rettangolo }],
    })).toThrow("Assegna una quota diversa a ogni piano.");
  });

  it("trova i metri da due riscontri del CAD anche con annotazioni decimali italiane", () => {
    const larghezza: QuotaDwg = { id: "A1", testo: "18.18", lunghezza: 18.18, angolo: 179, punto: [10, 0] };
    const profondita: QuotaDwg = { id: "A2", testo: "14,09 m", lunghezza: 14.09, angolo: 89, punto: [0, 8] };
    const riscontri = [{ quota: larghezza, metri: 18.18 }, { quota: profondita, metri: 14.09 }];
    expect(leggiQuoteDwg([larghezza, profondita, larghezza, { ...larghezza, id: "A3", lunghezza: -1 }, { ...larghezza, id: "A4", punto: [Infinity, 0] }]))
      .toEqual([larghezza, profondita]);
    expect(direzioniDistinteDwg(larghezza, profondita)).toBe(true);
    expect(direzioniDistinteDwg(larghezza, { ...profondita, angolo: 1 })).toBe(false);
    expect(unitaCompatibiliDwg(riscontri)).toEqual([6]);
    expect(unitaCompatibiliDwg([{ quota: larghezza, metri: 18.18 }, { quota: profondita, metri: 0.01409 }])).toEqual([]);
  });
});
