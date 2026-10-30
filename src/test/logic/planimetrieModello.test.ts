import { describe, expect, it } from "vitest";
import {
  VERSIONE_SCHEMA,
  ambitiDi,
  nuovaPlanimetria,
  origineMisura,
  originePeggiore,
  validaPlanimetria,
  type Planimetria,
} from "../../../shared/planimetrie/modello.ts";

/** Una stanza 400×300 (filo interno) chiusa da quattro pareti spesse 20 cm. */
function stanzaSemplice(): Planimetria {
  const p = nuovaPlanimetria("Prova");
  const l = p.livelli[0];
  const muro = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
    id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore: 20, altezza: 270,
    tipo: "esterno" as const, stato: "esistente" as const, origine: "rilevata" as const,
  });
  l.fatto.muri = [muro("m1", 0, 0, 420, 0), muro("m2", 420, 0, 420, 320), muro("m3", 420, 320, 0, 320), muro("m4", 0, 320, 0, 0)];
  l.fatto.aperture = [{
    id: "a1", muroId: "m1", tipo: "porta", offset: 100, larghezza: 80, altezza: 210, davanzale: 0,
    manovra: "battente", verso: { cardine: "p1", lato: "sinistra" }, stato: "esistente", origine: "rilevata",
  }];
  l.fatto.locali = [{
    id: "l1", nome: "Camera", destinazione: "camera", altezza: 270, origine: "rilevata",
    contorno: [{ x: 10, y: 10 }, { x: 410, y: 10 }, { x: 410, y: 310 }, { x: 10, y: 310 }],
  }];
  return p;
}

describe("modello della planimetria", () => {
  it("una pianta nuova è valida, in cm, con un livello e lo stato di fatto vuoto", () => {
    const p = nuovaPlanimetria("Appartamento Rossi");
    expect(p.schema).toBe(VERSIONE_SCHEMA);
    expect(p.unita).toBe("cm");
    expect(p.livelli).toHaveLength(1);
    expect(p.livelli[0].fatto.muri).toEqual([]);
    expect(p.livelli[0].proposte).toEqual([]);
    expect(validaPlanimetria(p)).toEqual({ ok: true, planimetria: p });
  });

  it("accetta una pianta completa e la restituisce uguale", () => {
    const p = stanzaSemplice();
    const esito = validaPlanimetria(JSON.parse(JSON.stringify(p)));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.planimetria).toEqual(p);
  });

  it("rifiuta ciò che non è una pianta, con un messaggio comprensibile", () => {
    const esito = validaPlanimetria("ciao");
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errori[0]).toMatch(/non è una pianta/i);
  });

  it("rifiuta una pianta di una versione futura dello schema", () => {
    const p = { ...nuovaPlanimetria(), schema: VERSIONE_SCHEMA + 1 };
    const esito = validaPlanimetria(p);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errori.join(" ")).toMatch(/versione più nuova/i);
  });

  it("segnala misure negative o mancanti dicendo dove", () => {
    const p = stanzaSemplice();
    (p.livelli[0].fatto.muri[1] as { spessore: number }).spessore = -5;
    delete (p.livelli[0].fatto.locali[0] as { altezza?: number }).altezza;
    const esito = validaPlanimetria(p);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori).toContain("Piano terra, stato di fatto, parete m2: lo spessore deve essere un numero maggiore di zero.");
      expect(esito.errori).toContain("Piano terra, stato di fatto, locale «Camera»: l'altezza deve essere un numero maggiore di zero.");
    }
  });

  it("rifiuta tipi, stati e origini sconosciuti", () => {
    const p = stanzaSemplice();
    (p.livelli[0].fatto.aperture[0] as { tipo: string }).tipo = "oblò";
    (p.livelli[0].fatto.muri[0] as { origine: string }).origine = "inventata";
    const esito = validaPlanimetria(p);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.errori.some(e => /apertura a1: il tipo/.test(e))).toBe(true);
      expect(esito.errori.some(e => /parete m1: l'origine/.test(e))).toBe(true);
    }
  });

  it("rifiuta id ripetuti nello stesso stato, anche su livelli diversi", () => {
    const p = stanzaSemplice();
    p.livelli.push({ id: "p1", nome: "Primo piano", quota: 300, fatto: { ...p.livelli[0].fatto, locali: [], aperture: [] }, proposte: [] });
    const esito = validaPlanimetria(p);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errori.some(e => /m1.*usato due volte/.test(e))).toBe(true);
  });

  it("una proposta ha un id e il suo stato completo; gli ambiti sono fatto e progetto:<id>", () => {
    const p = stanzaSemplice();
    p.livelli[0].proposte.push({ id: "A", nome: "Proposta A", ...JSON.parse(JSON.stringify(p.livelli[0].fatto)) });
    expect(validaPlanimetria(p).ok).toBe(true);
    expect(ambitiDi(p).map(a => a.chiave)).toEqual(["fatto", "progetto:A"]);
  });

  it("l'origine di una misura è quella del campo se data, altrimenti quella dell'oggetto", () => {
    const muro = stanzaSemplice().livelli[0].fatto.muri[0];
    expect(origineMisura(muro, "altezza")).toBe("rilevata");
    muro.origineMisure = { altezza: "stimata" };
    expect(origineMisura(muro, "altezza")).toBe("stimata");
    expect(origineMisura(muro, "lunghezza")).toBe("rilevata");
  });

  it("l'origine peggiore: stimata vince su da documento, che vince su rilevata", () => {
    expect(originePeggiore("rilevata", "da_documento")).toBe("da_documento");
    expect(originePeggiore("da_documento", "stimata", "rilevata")).toBe("stimata");
    expect(originePeggiore()).toBe("rilevata");
  });
});
