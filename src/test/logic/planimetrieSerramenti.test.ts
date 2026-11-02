import { describe, expect, it } from "vitest";
import { anteDi, eScorrevole, manovraDi, misureSerramento, sistemaDi, sistemiAmmessi } from "../../../shared/planimetrie/serramenti";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";

describe("serramenti", () => {
  it("sistema e ante di default", () => {
    expect(sistemaDi({ tipo: "porta", larghezza: 80, manovra: "battente" })).toBe("battente");
    expect(sistemaDi({ tipo: "porta", larghezza: 80, manovra: "scorrevole" })).toBe("scorrevole");
    expect(anteDi({ tipo: "finestra", larghezza: 120, manovra: "battente" })).toBe(1);
    expect(anteDi({ tipo: "finestra", larghezza: 160, manovra: "battente" })).toBe(2);
    expect(anteDi({ tipo: "porta", larghezza: 160, manovra: "battente" })).toBe(1);
    expect(anteDi({ tipo: "finestra", larghezza: 160, manovra: "battente", ante: 3 })).toBe(3);
    expect(anteDi({ tipo: "varco", larghezza: 100, manovra: "nessuna" })).toBe(0);
  });
  it("la manovra segue il sistema", () => {
    expect(manovraDi("scorrevole_scomparsa")).toBe("scorrevole");
    expect(manovraDi("alzante_scorrevole")).toBe("scorrevole");
    expect(manovraDi("fisso")).toBe("nessuna");
    expect(manovraDi("anta_ribalta")).toBe("battente");
    expect(eScorrevole("libro")).toBe(false);
  });
  it("sistemi ammessi per tipo: la porta non è a vasistas, la finestra non è a scomparsa", () => {
    expect(sistemiAmmessi("porta")).toContain("scorrevole_scomparsa");
    expect(sistemiAmmessi("porta")).not.toContain("vasistas");
    expect(sistemiAmmessi("finestra")).toContain("vasistas");
    expect(sistemiAmmessi("finestra")).not.toContain("scorrevole_scomparsa");
    expect(sistemiAmmessi("varco")).toHaveLength(0);
  });
  it("controtelaio: foro meno 1 cm per lato, telaio meno 1,5, anta divisa per le ante", () => {
    const m = misureSerramento({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", ante: 2 }, { spessore: 30 });
    expect(m.controtelaio).toEqual({ larghezza: 138, altezza: 129, profondita: 30 });
    expect(m.telaio.larghezza).toBeCloseTo(135, 5);
    expect(m.anta).toBeCloseTo((135 - 6) / 2, 5);
    expect(m.superficieMq).toBeCloseTo(1.82, 2);
    expect(m.perimetroMl).toBeCloseTo(5.34, 2);
    expect(m.controtelaioSpeciale).toBe(false);
  });
  it("la porta a scomparsa ha il controtelaio speciale e chiede una tasca di muro", () => {
    const m = misureSerramento({ tipo: "porta", larghezza: 80, altezza: 210, manovra: "scorrevole", sistema: "scorrevole_scomparsa" }, { spessore: 8 });
    expect(m.controtelaioSpeciale).toBe(true);
    expect(m.tascaScomparsa).toBe(85);
    expect(m.controtelaio.profondita).toBe(10);
  });
  it("il documento accetta ante e sistema e rifiuta valori sbagliati", () => {
    const doc = JSON.parse(JSON.stringify(trilocale));
    doc.livelli[0].fatto.aperture[0].ante = 2;
    doc.livelli[0].fatto.aperture[0].sistema = "anta_ribalta";
    expect(validaPlanimetria(doc).ok).toBe(true);
    doc.livelli[0].fatto.aperture[0].ante = 9;
    expect(validaPlanimetria(doc).ok).toBe(false);
    doc.livelli[0].fatto.aperture[0].ante = 2;
    doc.livelli[0].fatto.aperture[0].sistema = "volante";
    expect(validaPlanimetria(doc).ok).toBe(false);
  });
});

import { segniSerramento } from "@/components/planimetrie/editor/disegno";
import { verificheDiProgetto } from "../../../shared/planimetrie/interferenze";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { abacoSerramenti, csvSerramenti, riepilogoControtelai } from "@/lib/planimetrie/abachi";
import { costruisciScena } from "@/lib/planimetrie/tred/scena";
import type { Livello, Planimetria, StatoPianta } from "../../../shared/planimetrie/modello";

const muroEd = { id: "m1", p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, spessore: 12, altezza: 270, tipo: "tramezzo", stato: "esistente", origine: "rilevata" } as never;
// serve sia all'editor (posizione = centro, verso) sia al modello (offset = inizio del vano, verso con cardine)
const apEd = (extra: object) => {
  const a = { id: "a1", muroId: "m1", tipo: "porta", posizione: 300, larghezza: 80, altezza: 210, davanzale: 0, manovra: "battente", verso: { cerniera: "inizio", lato: "sinistra" }, stato: "esistente", origine: "rilevata", ...extra };
  return { ...a, offset: a.posizione - a.larghezza / 2 } as never;
};

describe("disegno 2D dei serramenti", () => {
  const conta = (a: object) => segniSerramento(apEd(a), muroEd);
  it("porta a un'anta: un'anta e un arco; a due ante: due archi", () => {
    expect(conta({}).filter((s) => s.tipo === "arco")).toHaveLength(1);
    expect(conta({ ante: 2, larghezza: 140 }).filter((s) => s.tipo === "arco")).toHaveLength(2);
  });
  it("scorrevole: nessun arco, anta tratteggiata aperta; a scomparsa: la tasca tratteggiata nel muro", () => {
    const sc = conta({ sistema: "scorrevole", manovra: "scorrevole" });
    expect(sc.some((s) => s.tipo === "arco")).toBe(false);
    expect(sc.some((s) => s.tipo === "linea" && s.tratteggio)).toBe(true);
    const sm = conta({ sistema: "scorrevole_scomparsa", manovra: "scorrevole" });
    expect(sm.filter((s) => s.tipo === "linea" && s.tratteggio).length).toBeGreaterThanOrEqual(3);
  });
  it("finestra a 3 ante: due montanti in più", () => {
    const base = segniSerramento(apEd({ tipo: "finestra", davanzale: 90, altezza: 130, larghezza: 180 }), muroEd).length;
    const tre = segniSerramento(apEd({ tipo: "finestra", davanzale: 90, altezza: 130, larghezza: 180, ante: 3 }), muroEd).length;
    expect(tre - base).toBe(1); // default 2 ante (1 montante) → 3 ante (2 montanti)
  });
});

const doc = (aperture: object[], spessore = 12): Planimetria => ({ schemaVersione: 1, titolo: "t", livelli: [{ id: "l", nome: "Terra", quota: 0, proposte: [], fatto: {
  muri: [{ ...(muroEd as object), spessore }], aperture, locali: [], elementi: [], quote: [], testi: [] } }] } as never);

describe("controtelai, abaco, computo e verifiche", () => {
  it("l'abaco dà sistema, ante, controtelaio e il riepilogo da ordinare", () => {
    const d = doc([apEd({ id: "a1", posizione: 100, stato: "nuovo", sistema: "scorrevole_scomparsa", manovra: "scorrevole" }), apEd({ id: "a2", tipo: "finestra", posizione: 400, larghezza: 140, altezza: 130, davanzale: 90, stato: "nuovo", ante: 2 }), apEd({ id: "a3", tipo: "finestra", posizione: 520, larghezza: 140, altezza: 130, davanzale: 90, stato: "nuovo", ante: 2 })]);
    const righe = abacoSerramenti(d, "l", "fatto");
    expect(righe[0].sistema).toBe("Scorrevole a scomparsa");
    expect(righe[0].controtelaio.speciale).toBe(true);
    expect(righe[1].ante).toBe(2);
    expect(righe[1].controtelaio).toMatchObject({ larghezza: 138, altezza: 129 });
    const r = riepilogoControtelai(righe);
    expect(r.find((x) => /138/.test(x.descrizione))?.numero).toBe(2);
    expect(r.some((x) => /scomparsa/.test(x.descrizione))).toBe(true);
    expect(csvSerramenti(righe)).toContain("Controtelaio L cm");
  });
  it("il computo conta i controtelai, quelli speciali a parte, e la superficie dei serramenti", () => {
    const d = doc([apEd({ id: "a1", posizione: 100, sistema: "scorrevole_scomparsa", manovra: "scorrevole" }), apEd({ id: "a2", tipo: "finestra", posizione: 400, larghezza: 140, altezza: 130, davanzale: 90 })]);
    const q = calcolaQuantita(d);
    const v = (s: string) => Object.entries(q).find(([k]) => k.endsWith(s))?.[1];
    expect(v("serramenti:esistente:controtelaio.numero")?.valore).toBe(1);
    expect(v("serramenti:esistente:controtelaio_scomparsa.numero")?.valore).toBe(1);
    expect(v("struttura:esistente:serramenti.superficie_mq")?.valore).toBeCloseTo(0.8 * 2.1 + 1.4 * 1.3, 2);
    expect(v("struttura:esistente:serramenti.superficie_mq")?.unita).toBe("mq");
  });
  it("la porta a scomparsa senza tasca libera è non conforme; con tasca va bene; muro sottile segnalato", () => {
    const l = { id: "l", nome: "Terra", quota: 0 } as Livello;
    const prova = (aperture: object[], spessore = 12) => verificheDiProgetto(l, (doc(aperture, spessore).livelli[0].fatto as StatoPianta));
    const scompa = apEd({ id: "s", posizione: 300, sistema: "scorrevole_scomparsa", manovra: "scorrevole" });
    expect(prova([scompa]).find((x) => x.codice === "serramento")?.esito).toBe("ok");
    const stretta = { ...(scompa as object), posizione: 40 } as never;
    const bloccata = [apEd({ id: "x", posizione: 130, sistema: "scorrevole_scomparsa", manovra: "scorrevole" }), apEd({ id: "y", posizione: 220 }), apEd({ id: "z", posizione: 10, larghezza: 20 })];
    void stretta;
    expect(prova(bloccata).some((x) => x.codice === "serramento" && x.esito === "non_conforme")).toBe(true);
    expect(prova([scompa], 8).some((x) => /troppo sottile/.test(x.messaggio))).toBe(true);
  });
  it("ante larghe oltre 1 m sono segnalate", () => {
    const l = { id: "l", nome: "Terra", quota: 0 } as Livello;
    const r = verificheDiProgetto(l, doc([apEd({ id: "f", tipo: "finestra", larghezza: 150, altezza: 130, davanzale: 90, ante: 1 })]).livelli[0].fatto as StatoPianta);
    expect(r.some((x) => x.codice === "serramento" && x.esito === "attenzione")).toBe(true);
  });
});

describe("telaio dei serramenti in 3D", () => {
  const pianta = (extra: object) => ({
    muri: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" }],
    aperture: [{ id: "f1", muroId: "m1", tipo: "finestra", posizione: 300, larghezza: 140, altezza: 130, davanzale: 90, stato: "esistente", ...extra }],
    locali: [], elementi: [],
  }) as never;
  it("senza ante né sistema scelti resta il solo vetro; con le ante compare il telaio con i montanti", () => {
    expect(costruisciScena(pianta({}), { vista: "fatto" }).mesh.some((m) => m.id.startsWith("telaio:"))).toBe(false);
    const a = costruisciScena(pianta({ ante: 2, scorrevole: false }), { vista: "fatto" }).mesh.find((m) => m.id === "telaio:f1")!;
    const b = costruisciScena(pianta({ ante: 3, scorrevole: false }), { vista: "fatto" }).mesh.find((m) => m.id === "telaio:f1")!;
    expect(b.facce).toBeGreaterThan(a.facce);
    const s = costruisciScena(pianta({ ante: 2, scorrevole: true }), { vista: "fatto" }).mesh.find((m) => m.id === "telaio:f1")!;
    expect(s.facce).toBeGreaterThan(a.facce);
  });
});
