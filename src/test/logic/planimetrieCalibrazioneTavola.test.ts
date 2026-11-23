import { describe, expect, it } from "vitest";
import { calibraRicalco, riallineaPianoAllaTavola } from "@/lib/planimetrie/calibrazioneTavola";
import { nuovaPlanimetria, scalaModelloDaVerificare, statoVuoto, type Apertura, type Muro, type Ricalco } from "../../../shared/planimetrie/modello";
import { controllaPlanimetria } from "../../../shared/planimetrie/controllo";

describe("calibrazione della tavola con disegno", () => {
  it("ancora il primo estremo, ridimensiona i vani lungo il muro e mantiene provvisorie le misure in pianta", () => {
    const prima: Ricalco = { percorso: "test", x: 0, y: 0, opacita: .5, larghezzaCm: 2000, proporzione: .8 };
    const dopo = calibraRicalco(prima, { x: 200, y: -50 }, { x: 1200, y: -50 }, 1200, false);
    expect(dopo).toMatchObject({ larghezzaCm: 2400, calibrata: false });
    expect(dopo.x).toBeCloseTo(-40);
    expect(dopo.y).toBeCloseTo(10);
    const doc = nuovaPlanimetria();
    const muro: Muro = {
      id: "m", p1: { x: 200, y: -50 }, p2: { x: 1200, y: -50 }, spessore: 30, altezza: 290,
      stato: "esistente", tipo: "esterno", origine: "da_documento",
    };
    const vano: Apertura = {
      id: "v", muroId: "m", tipo: "finestra", offset: 200, larghezza: 100, altezza: 150, davanzale: 90,
      stato: "esistente", origine: "da_documento", manovra: "battente", superficieApribileMq: 1,
    };
    doc.livelli[0].ricalco = prima;
    doc.livelli[0].fatto = { ...statoVuoto(), muri: [muro], aperture: [vano] };
    doc.livelli.push({ id: "alto", nome: "Piano superiore", quota: 300, fatto: statoVuoto(), proposte: [] });
    const nuovo = riallineaPianoAllaTavola(doc, doc.livelli[0].id, prima, dopo);
    const [piano] = nuovo.livelli;
    expect(nuovo.livelli[1]).toBe(doc.livelli[1]);
    expect(piano.fatto.muri[0].p1).toEqual(muro.p1);
    expect(piano.fatto.muri[0].p2).toEqual({ x: 1400, y: -50 });
    expect(piano.fatto.aperture[0]).toMatchObject({
      offset: 240, larghezza: 120, altezza: 150, davanzale: 90, superficieApribileMq: 1,
      origineMisure: { offset: "stimata", larghezza: "stimata" },
    });
    expect(scalaModelloDaVerificare(piano)).toBe(true);
    expect(controllaPlanimetria(nuovo).filter(p => p.codice.startsWith("apertura"))).toEqual([]);
    expect(doc.livelli[0].fatto.aperture[0]).toBe(vano);
  });
});
