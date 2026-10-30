import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { controllaPlanimetria, haErrori } from "../../../shared/planimetrie/controllo.ts";
import { aPlanimetria, daPlanimetria, datiVista, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import {
  aggiungiApertura,
  aggiungiParete,
  aggiungiStanza,
  chiudiStanze,
  eliminaMuro,
  rinominaStanza,
  giraApertura,
  rettangolo,
} from "@/components/planimetrie/editor/comandi";

const esempi: Array<[string, Planimetria]> = [
  ["bilocale", bilocale as unknown as Planimetria],
  ["trilocale", trilocale as unknown as Planimetria],
];

describe("dal documento all'editor e ritorno", () => {
  it.each(esempi)("%s: le quantità non cambiano", (_nome, doc) => {
    const dopo = aPlanimetria(daPlanimetria(doc), doc);
    expect(validaPlanimetria(dopo).ok).toBe(true);
    const prima = calcolaQuantita(doc);
    const ora = calcolaQuantita(dopo);
    expect(Object.keys(ora).sort()).toEqual(Object.keys(prima).sort());
    for (const [chiave, q] of Object.entries(prima)) {
      expect(ora[chiave].valore, chiave).toBeCloseTo(q.valore, 2);
      expect(ora[chiave].origine, chiave).toBe(q.origine);
    }
  });

  it.each(esempi)("%s: niente errori nuovi dal controllo", (_nome, doc) => {
    const prima = controllaPlanimetria(doc).filter((p) => p.gravita === "errore").length;
    const dopo = controllaPlanimetria(aPlanimetria(daPlanimetria(doc), doc)).filter((p) => p.gravita === "errore").length;
    expect(dopo).toBe(prima);
  });

  it("le porte tengono cardine e lato anche capovolgendo y", () => {
    const doc = bilocale as unknown as Planimetria;
    const dopo = aPlanimetria(daPlanimetria(doc), doc);
    expect(dopo.livelli[0].fatto.aperture.map((a) => [a.id, a.offset, a.verso])).toEqual(
      doc.livelli[0].fatto.aperture.map((a) => [a.id, a.offset, a.verso]),
    );
  });

  it("trilocale: la proposta tiene la zona giorno con il suo nome", () => {
    const doc = trilocale as unknown as Planimetria;
    const pianta = daPlanimetria(doc);
    expect(pianta.muri.some((m) => m.stato === "da_demolire")).toBe(true);
    expect(pianta.muri.some((m) => m.stato === "nuovo")).toBe(true);
    const vista = datiVista(pianta, aPlanimetria(pianta, doc), "progetto");
    expect(vista.locali.map((l) => l.nome)).toContain("Soggiorno con cucina");
    expect(vista.locali.map((l) => l.nome)).not.toContain("Cucina");
  });
});

describe("una pianta disegnata nell'editor", () => {
  function bilocaleDisegnato() {
    let p = piantaVuota();
    p = aggiungiStanza(p, rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }), { nome: "Soggiorno", destinazione: "soggiorno" }).pianta;
    p = aggiungiStanza(p, rettangolo({ x: 410, y: 0 }, { x: 720, y: 510 }), { nome: "Camera", destinazione: "camera" }).pianta;
    const comune = p.muri.find((m) => m.p1.x === 410 && m.p2.x === 410)!;
    const fondo = p.muri.find((m) => m.p1.y === 510 && m.p2.y === 510 && Math.min(m.p1.x, m.p2.x) === 0)!;
    const sopra = p.muri.find((m) => m.p1.y === 0 && m.p2.y === 0 && Math.min(m.p1.x, m.p2.x) === 410)!;
    p = aggiungiApertura(p, comune.id, "porta", 250).pianta;
    p = aggiungiApertura(p, fondo.id, "porta", 200).pianta;
    p = aggiungiApertura(p, sopra.id, "finestra", 150).pianta;
    return { p, comune };
  }

  it("diventa un documento valido, senza errori, con i mq giusti", () => {
    const { p } = bilocaleDisegnato();
    const doc = aPlanimetria(p);
    expect(validaPlanimetria(doc).ok).toBe(true);
    expect(haErrori(controllaPlanimetria(doc))).toBe(false);
    expect(doc.livelli[0].proposte).toHaveLength(0);
    const v = datiVista(p, doc, "fatto");
    expect(v.locali.map((l) => [l.nome, l.mq])).toEqual([
      ["Soggiorno", 20],
      ["Camera", 15],
    ]);
    expect(v.locali[0].perimetro).toBeCloseTo(18, 4);
  });

  it("nel progetto, abbattendo la parete in comune, nasce un locale solo", () => {
    const { p, comune } = bilocaleDisegnato();
    const progetto = eliminaMuro(p, comune.id, "progetto");
    const doc = aPlanimetria(progetto);
    expect(doc.livelli[0].proposte).toHaveLength(1);
    expect(doc.livelli[0].fatto.muri.every((m) => m.stato === "esistente")).toBe(true);
    const oggi = datiVista(progetto, doc, "fatto");
    const dopo = datiVista(progetto, doc, "progetto");
    expect(oggi.locali).toHaveLength(2);
    expect(dopo.locali).toHaveLength(1);
    // 20 + 15 mq + la striscia del tramezzo tolto (10 cm × 5 m)
    expect(dopo.locali[0].mq).toBeCloseTo(35.5, 4);
    expect(dopo.locali[0].nome).toBe("Soggiorno");
    expect(doc.livelli[0].proposte[0].muri.find((m) => m.id === comune.id)?.stato).toBe("da_demolire");
  });

  it("un tramezzo nuovo nel progetto divide la stanza in due", () => {
    const { p } = bilocaleDisegnato();
    const r = aggiungiParete(p, { x: 410, y: 300 }, { x: 720, y: 300 }, { stato: "nuovo" });
    const doc = aPlanimetria(r.pianta);
    const dopo = datiVista(r.pianta, doc, "progetto");
    expect(dopo.locali).toHaveLength(3);
    expect(doc.livelli[0].fatto.muri.some((m) => m.id === r.id)).toBe(false);
  });

  it("gli id dei locali del progetto restano gli stessi da una modifica all'altra", () => {
    const { p, comune } = bilocaleDisegnato();
    const progetto = eliminaMuro(p, comune.id, "progetto");
    const doc1 = aPlanimetria(progetto);
    const r = aggiungiParete(progetto, { x: 0, y: 300 }, { x: 200, y: 300 }, { stato: "nuovo" });
    const doc2 = aPlanimetria(r.pianta, doc1);
    const id1 = doc1.livelli[0].proposte[0].locali.map((l) => l.id);
    expect(doc2.livelli[0].proposte[0].locali.map((l) => l.id)).toEqual(expect.arrayContaining(id1));
  });

  it("il verso della porta fa il giro completo e torna uguale", () => {
    const { p } = bilocaleDisegnato();
    const porta = p.aperture[0];
    let q = p;
    for (let i = 0; i < 4; i++) q = giraApertura(q, porta.id);
    const ritorno = daPlanimetria(aPlanimetria(q));
    expect(ritorno.aperture.find((a) => a.id === porta.id)?.verso).toEqual(porta.verso);
  });
});

describe("stanze che si chiudono da sole", () => {
  it("quattro pareti disegnate a mano fanno una stanza, e non due volte", () => {
    let p = piantaVuota();
    const giro = [
      [0, 0, 400, 0],
      [400, 0, 400, 300],
      [400, 300, 0, 300],
      [0, 300, 0, 0],
    ];
    for (const [x1, y1, x2, y2] of giro) p = aggiungiParete(p, { x: x1, y: y1 }, { x: x2, y: y2 }).pianta;
    expect(chiudiStanze(aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 400, y: 0 }).pianta).locali).toHaveLength(0);
    const chiusa = chiudiStanze(p);
    expect(chiusa.locali).toHaveLength(1);
    expect(chiudiStanze(chiusa).locali).toHaveLength(1);
    const v = datiVista(chiusa, aPlanimetria(chiusa), "fatto");
    expect(v.locali[0].mq).toBeCloseTo(3.9 * 2.9, 4);
  });

  it("nel progetto un tramezzo nuovo che divide una stanza ne fa nascere una nuova", () => {
    let p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 })).pianta;
    p = aggiungiParete(p, { x: 0, y: 200 }, { x: 410, y: 200 }, { stato: "nuovo" }).pianta;
    const chiusa = chiudiStanze(p, "progetto");
    expect(chiusa.locali.filter((l) => l.stato === "nuovo")).toHaveLength(1);
    expect(chiudiStanze(p, "fatto").locali).toHaveLength(1);
  });

  it("nello stato di fatto una parete che taglia la stanza la divide in due", () => {
    let p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 })).pianta;
    p = aggiungiParete(p, { x: 0, y: 200 }, { x: 410, y: 200 }).pianta;
    const chiusa = chiudiStanze(p, "fatto");
    expect(chiusa.locali).toHaveLength(2);
    const v = datiVista(chiusa, aPlanimetria(chiusa), "fatto");
    expect(v.locali.reduce((t, l) => t + l.mq, 0)).toBeCloseTo(4 * 5 - 4 * 0.1, 4);
  });
});

describe("nomi delle stanze nel progetto", () => {
  it("nel progetto il nome cambia solo nel progetto", () => {
    const p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }), { nome: "Cucina", destinazione: "cucina" });
    const id = p.id;
    const q = rinominaStanza(p.pianta, id, { nome: "Cucina", destinazione: "cucina" }, { nome: "Studio", destinazione: "studio" }, "progetto");
    expect(q.locali[0].nome).toBe("Cucina");
    // con una demolizione nasce la proposta: lì la stanza si chiama Studio
    const muro = q.muri[0];
    const doc = aPlanimetria(eliminaMuro(q, muro.id, "progetto"));
    expect(doc.livelli[0].fatto.locali[0].nome).toBe("Cucina");
    const oggi = rinominaStanza(p.pianta, id, { nome: "Cucina", destinazione: "cucina" }, { nome: "Cucinotto" }, "fatto");
    expect(oggi.locali[0].nome).toBe("Cucinotto");
  });
});
