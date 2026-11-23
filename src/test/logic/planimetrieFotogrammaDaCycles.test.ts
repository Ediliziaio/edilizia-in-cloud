import { afterEach, expect, it, vi } from "vitest";
import { leggiFotogrammaDaCycles, preparaFotogrammaDaCycles } from "@/lib/planimetrie/render/fotogrammaDaCycles";
import { descriviFotogramma } from "@/components/planimetrie/tred/fotogramma";

afterEach(() => vi.restoreAllMocks());

it("riusa i pixel Cycles e la stanza corretta durante il passaggio al configuratore", () => {
  const tempo = vi.spyOn(Date, "now").mockReturnValue(1000);
  const localeId = "soggiorno";
  const metadati = descriviFotogramma({
    localeId,
    pianta: { muri: [], aperture: [], elementi: [], locali: [{
      id: localeId, nome: "Soggiorno", altezza: 280, destinazione: "soggiorno",
      contorno: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
    }] },
    telecamera: { posizione: [1, 1.6, 1], guarda: [2, 1.5, 2], fov: 48 },
    larghezza: 1200, altezza: 800,
  });
  const fotogramma = { png: new Blob(["png"], { type: "image/png" }), metadati };
  const percorso = "/azienda/planimetrie/demo/stanza/soggiorno?livello=pt&versione=2";
  const id = preparaFotogrammaDaCycles(percorso, { fotogramma, pavimento: "rovere" });

  expect(leggiFotogrammaDaCycles(percorso, id)?.fotogramma).toBe(fotogramma);
  expect(leggiFotogrammaDaCycles(percorso, id)?.pavimento).toBe("rovere");
  expect(leggiFotogrammaDaCycles(percorso.replace("soggiorno", "cucina"), id)).toBeUndefined();
  expect(leggiFotogrammaDaCycles(percorso, undefined)).toBeUndefined();
  tempo.mockReturnValue(1000 + 5 * 60_000);
  expect(leggiFotogrammaDaCycles(percorso, id)).toBeUndefined();
});
