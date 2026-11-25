import { describe, expect, it } from "vitest";
import { mancanzeProgetto } from "@/lib/planimetrie/guidaProgetto";
import type { Planimetria } from "../../../shared/planimetrie/modello";

const rett = (x: number, y: number, l: number, h: number) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];
const stanza = (id: string, unita: string | undefined, contorno: Array<{ x: number; y: number }>) =>
  ({ id, nome: id, destinazione: "altro", altezza: 300, origine: "rilevata", contorno, ...(unita ? { unita } : {}) });
const muro = (id: string, x1: number, y1: number, x2: number, y2: number) =>
  ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 20, altezza: 300, tipo: "tramezzo", stato: "esistente", origine: "rilevata" });
const porta = (id: string, muroId: string, offset: number, tipo = "porta") =>
  ({ id, muroId, tipo, offset, larghezza: 90, altezza: 210, davanzale: 0, manovra: "battente", stato: "esistente", origine: "rilevata" });

/**
 * Due appartamenti ai lati di un vano scala (x 400-600). Int. 01: soggiorno e camera, porta
 * sul vano scala. Int. 02: soggiorno e camera con la sola porta interna, e una portafinestra.
 */
function pianta(conIngresso02: boolean): Planimetria {
  const muri = [muro("m1", 400, 0, 400, 600), muro("m2", 600, 0, 600, 600), muro("m3", 0, 300, 400, 300), muro("m4", 600, 300, 1000, 300), muro("m5", 1000, 0, 1000, 600)];
  const aperture = [porta("p1", "m1", 100), porta("p2", "m3", 150), porta("p3", "m4", 150), porta("pf", "m5", 100, "portafinestra"),
    ...(conIngresso02 ? [porta("p4", "m2", 400)] : [])];
  return {
    schema: 1, unita: "cm",
    livelli: [{ id: "pt", nome: "Piano terra", quota: 0, proposte: [], fatto: { muri, aperture, elementi: [], quote: [], testi: [], locali: [
      stanza("a", "Int. 01", rett(10, 10, 380, 280)), stanza("b", "Int. 01", rett(10, 310, 380, 280)),
      stanza("scala", undefined, rett(410, 10, 180, 580)),
      stanza("c", "Int. 02", rett(610, 10, 380, 280)), stanza("d", "Int. 02", rett(610, 310, 380, 280)),
    ] } }],
  } as unknown as Planimetria;
}

describe("ingresso delle unità", () => {
  it("segnala l'unità che ha solo porte interne e portefinestre", () => {
    const m = mancanzeProgetto(pianta(false), "fatto").filter((x) => x.tipo === "accesso");
    expect(m.map((x) => x.testo)).toEqual(["Int. 02: non trovo la porta d'ingresso (dal vano scala o da fuori), controllala o aggiungila"]);
    expect(m[0].livelloId).toBe("pt");
  });
  it("con la porta sul vano scala non manca niente", () => {
    expect(mancanzeProgetto(pianta(true), "fatto").filter((x) => x.tipo === "accesso")).toEqual([]);
  });
});
