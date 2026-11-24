import { describe, expect, it } from "vitest";
import { riepilogoProgetto, tipoAlloggio } from "@/lib/planimetrie/riepilogoProgetto";
import type { Planimetria } from "../../../shared/planimetrie/modello";

const stanza = (id: string, nome: string, destinazione: string, x: number, unita?: string) => ({
  id, nome, destinazione, altezza: 300, origine: "rilevata", ...(unita ? { unita } : {}),
  contorno: [{ x, y: 0 }, { x: x + 400, y: 0 }, { x: x + 400, y: 300 }, { x, y: 300 }],
});
const doc = {
  schema: 1, unita: "cm",
  livelli: [{
    id: "pt", nome: "Piano terra", quota: 0, proposte: [],
    fatto: { muri: [], aperture: [], elementi: [], quote: [], testi: [], locali: [
      stanza("a", "soggiorno", "soggiorno", 0, "Int. 01"), stanza("b", "letto", "camera", 400, "Int. 01"), stanza("c", "bagno", "bagno", 800, "Int. 01"),
      stanza("d", "soggiorno", "soggiorno", 1200, "Int. 02"), stanza("e", "letto", "camera", 1600, "Int. 02"), stanza("f", "letto", "camera", 2000, "Int. 02"),
      stanza("g", "Locale 5", "altro", 2400),
    ] },
  }],
} as unknown as Planimetria;

describe("riepilogo del progetto", () => {
  it("unità con tipo, bagni e m², come nelle tavole", () => {
    const r = riepilogoProgetto(doc, "fatto");
    expect(r.unita.map((u) => [u.nome, u.tipo, u.bagni, u.nettaMq])).toEqual([["Int. 01", "Bilocale", 1, 36], ["Int. 02", "Da completare", 0, 36]]);
    expect(r.senzaUnitaMq).toBe(12);
    expect(r.piani).toEqual([{ id: "pt", nome: "Piano terra", stanze: 7, nettaMq: 84, lordaMq: 0 }]);
  });
  it("il tipo viene dalle camere", () => {
    expect([0, 1, 2, 3, 4].map(tipoAlloggio)).toEqual(["Monolocale", "Bilocale", "Trilocale", "Quadrilocale", "5 locali"]);
  });
});
