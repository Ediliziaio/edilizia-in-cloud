import { describe, expect, it } from "vitest";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import type { Planimetria } from "../../../shared/planimetrie/modello";

// Un piano che oggi ha solo i muri (letto da DWG, da rifare) e le stanze solo nel progetto.
const q = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const muro = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 30, altezza: 300, tipo: "esterno", stato: "esistente" });
const muri = [muro("a", 0, 0, 1200, 0), muro("b", 1200, 0, 1200, 500), muro("c", 1200, 500, 0, 500), muro("d", 0, 500, 0, 0)];
const doc = {
  schema: 1, unita: "cm",
  livelli: [{
    id: "pt", nome: "Piano terra", quota: 0,
    fatto: { muri, aperture: [], locali: [], elementi: [], quote: [], testi: [] },
    proposte: [{ id: "A", nome: "Costruzione", muri, aperture: [], elementi: [], quote: [], testi: [], locali: [
      { id: "s1", nome: "Soggiorno", destinazione: "soggiorno", contorno: q(15, 15, 500, 470), altezza: 300, origine: "stimata" },
      { id: "s2", nome: "Letto", destinazione: "camera", contorno: q(530, 15, 300, 470), altezza: 300, origine: "stimata" },
    ] }],
  }],
} as unknown as Planimetria;

describe("stanze che esistono solo nel progetto", () => {
  it("l'editor le carica, e aggiungendone una le altre restano", () => {
    const pianta = daPlanimetria(doc, "pt", "A");
    expect(pianta.locali.map((l) => l.id)).toEqual(["s1", "s2"]);
    const r = C.aggiungiStanza(pianta, q(845, -485, 340, 470).map((p) => ({ x: p.x, y: p.y })), { stato: "nuovo", senzaMuri: true });
    const dopo = aPlanimetria(r.pianta, doc, "pt", "A", pianta);
    const nomi = dopo.livelli[0].proposte[0].locali.map((l) => l.nome);
    expect(nomi).toEqual(expect.arrayContaining(["Soggiorno", "Letto"]));
    expect(nomi).toHaveLength(3);
  });
});
