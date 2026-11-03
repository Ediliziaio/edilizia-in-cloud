import { describe, expect, it } from "vitest";
import { altezzaCassonettoConsigliata, cassonettoDi, latoEsterno, misureOscurante, misureSerramento, misureZanzariera, oscuranteAmmessi, oscuranteDi, zanzarieraAmmessa, zanzarieraDi } from "../../../shared/planimetrie/serramenti";
import { validaPlanimetria, type Livello, type Planimetria, type StatoPianta } from "../../../shared/planimetrie/modello";
import { verificheDiProgetto } from "../../../shared/planimetrie/interferenze";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { abacoSerramenti, csvSerramenti, riepilogoControtelai, riepilogoOscuranti } from "@/lib/planimetrie/abachi";
import { segniSerramento, segniZanzariera } from "@/components/planimetrie/editor/disegno";
import { modificaApertura } from "@/components/planimetrie/editor/comandi";
import { daStatoPianta } from "@/lib/planimetrie/tred/adattatore";
import { costruisciScena } from "@/lib/planimetrie/tred/scena";
import { simboloOscurante, simboloZanzariera } from "@/lib/planimetrie/esporta/scena";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";

const muro = (spessore = 30) => ({ id: "m1", p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, spessore, altezza: 270, tipo: "esterno", stato: "esistente", origine: "rilevata" });
const fin = (extra: object = {}) => {
  const a = { id: "f1", muroId: "m1", tipo: "finestra", posizione: 300, larghezza: 140, altezza: 130, davanzale: 90, manovra: "battente", verso: { cerniera: "inizio", lato: "sinistra" }, stato: "nuovo", origine: "rilevata", ...extra };
  return { ...a, offset: a.posizione - a.larghezza / 2 } as never;
};
const doc = (aperture: object[], spessore = 30): Planimetria =>
  ({ schemaVersione: 1, titolo: "t", livelli: [{ id: "l", nome: "Terra", quota: 0, proposte: [], fatto: { muri: [muro(spessore)], aperture, locali: [], elementi: [], quote: [], testi: [] } }] }) as never;
const stato = (d: Planimetria) => d.livelli[0].fatto as StatoPianta;
const livello = { id: "l", nome: "Terra", quota: 0 } as Livello;

describe("misure di oscurante e cassonetto", () => {
  it("solo finestre e portefinestre hanno l'oscurante; senza scelta non c'è né oscurante né cassonetto", () => {
    expect(oscuranteAmmessi("finestra")).toContain("tapparella");
    expect(oscuranteAmmessi("portafinestra")).toContain("persiana");
    expect(oscuranteAmmessi("porta")).toHaveLength(0);
    expect(oscuranteAmmessi("varco")).toHaveLength(0);
    expect(oscuranteDi({ tipo: "porta", larghezza: 80, manovra: "battente", oscurante: "tapparella" })).toBeNull();
    expect(cassonettoDi({ tipo: "finestra", larghezza: 120, manovra: "battente" })).toBeNull();
    expect(cassonettoDi({ tipo: "finestra", larghezza: 120, manovra: "battente", oscurante: "persiana" })).toBeNull();
    expect(cassonettoDi({ tipo: "finestra", larghezza: 120, manovra: "battente", oscurante: "tapparella" })).toBe("monoblocco");
  });
  it("l'altezza del cassonetto sale col vano; la veneziana ha 5 cm in più", () => {
    expect(altezzaCassonettoConsigliata(120)).toBe(22);
    expect(altezzaCassonettoConsigliata(200)).toBe(25);
    expect(altezzaCassonettoConsigliata(240)).toBe(30);
    expect(altezzaCassonettoConsigliata(300)).toBe(35);
    expect(altezzaCassonettoConsigliata(200, "veneziana")).toBe(30);
  });
  it("il monoblocco si prende l'altezza dal vano: il serramento si accorcia e il controtelaio è quello col cassonetto", () => {
    const senza = misureSerramento({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente" });
    const mono = misureSerramento({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", oscurante: "tapparella" });
    expect(senza.controtelaioMonoblocco).toBe(false);
    expect(mono.controtelaioMonoblocco).toBe(true);
    expect(mono.cassonettoNelVano).toBe(22);
    expect(mono.controtelaio).toEqual(senza.controtelaio);
    expect(mono.telaio.altezza).toBeCloseTo(senza.telaio.altezza - 22, 5);
    const filo = misureSerramento({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", oscurante: "tapparella", cassonetto: "a_filo" });
    expect(filo.controtelaioMonoblocco).toBe(false);
    expect(filo.telaio.altezza).toBeCloseTo(senza.telaio.altezza, 5);
  });
  it("tapparella: telo, guide, albero e muro libero sopra il vano; persiana: ante e superficie", () => {
    const t = misureOscurante({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", oscurante: "tapparella", cassonetto: "a_filo", motore: true })!;
    expect(t.avvolgibile).toBe(true);
    expect(t.cassonetto).toMatchObject({ tipo: "a_filo", larghezza: 138, altezza: 22, profondita: 25 });
    expect(t.spazioSopra).toBe(22);
    expect(t.telo.larghezza).toBeCloseTo(140 - 2 - 3 - 8, 5);
    expect(t.guideMl).toBeCloseTo((2 * (130 - 1 - 1.5)) / 100, 2);
    expect(t.motore).toBe(true);
    const mono = misureOscurante({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", oscurante: "tapparella" })!;
    expect(mono.spazioSopra).toBe(0);
    expect(mono.telo.altezza).toBeCloseTo(t.telo.altezza - 22, 5);
    const p = misureOscurante({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente", oscurante: "persiana", ante: 2, cassonetto: "esterno" })!;
    expect(p.avvolgibile).toBe(false);
    expect(p.cassonetto).toBeNull();
    expect(p.ante).toBe(2);
    expect(p.superficieMq).toBeCloseTo(1.82, 2);
    expect(p.guideMl).toBe(0);
    expect(misureOscurante({ tipo: "finestra", larghezza: 140, altezza: 130, manovra: "battente" })).toBeNull();
  });
  it("il cassonetto esterno è alto e profondo uguale e sporge dal prospetto", () => {
    const e = misureOscurante({ tipo: "finestra", larghezza: 120, altezza: 150, manovra: "battente", oscurante: "veneziana", cassonetto: "esterno", altezzaCassonetto: 30 })!;
    expect(e.cassonetto).toMatchObject({ tipo: "esterno", altezza: 30, profondita: 30 });
    expect(e.spazioSopra).toBe(30);
  });
  it("da che parte è l'esterno: quello senza stanze", () => {
    const stanza = [{ x: 0, y: 20 }, { x: 600, y: 20 }, { x: 600, y: 500 }, { x: 0, y: 500 }];
    expect(latoEsterno({ x: 300, y: 0 }, { x: 0, y: 1 }, 30, [stanza])).toBe(-1);
    expect(latoEsterno({ x: 300, y: 0 }, { x: 0, y: -1 }, 30, [stanza])).toBe(1);
    expect(latoEsterno({ x: 300, y: 0 }, { x: 0, y: 1 }, 30, [])).toBe(0);
  });
});

describe("documento e comandi", () => {
  it("il documento accetta oscurante, cassonetto e motore e rifiuta i valori sbagliati", () => {
    const d = JSON.parse(JSON.stringify(trilocale));
    const a = d.livelli[0].fatto.aperture[0];
    Object.assign(a, { oscurante: "tapparella", cassonetto: "esterno", altezzaCassonetto: 28, motore: true });
    expect(validaPlanimetria(d).ok).toBe(true);
    a.oscurante = "tenda";
    expect(validaPlanimetria(d).ok).toBe(false);
    a.oscurante = "tapparella";
    a.cassonetto = "sotterraneo";
    expect(validaPlanimetria(d).ok).toBe(false);
    a.cassonetto = "a_filo";
    a.altezzaCassonetto = -3;
    expect(validaPlanimetria(d).ok).toBe(false);
    a.altezzaCassonetto = 25;
    a.motore = "sì";
    expect(validaPlanimetria(d).ok).toBe(false);
  });
  it("scegliendo persiana si toglie il cassonetto; togliendo l'oscurante, tutto; la porta non ne tiene", () => {
    const pianta = { muri: [], aperture: [{ id: "f1", muroId: "m1", tipo: "finestra", posizione: 300, larghezza: 140, altezza: 130, davanzale: 90, manovra: "battente", verso: { cerniera: "inizio", lato: "destra" }, stato: "nuovo" }], locali: [], elementi: [], quote: [], testi: [], aree: [] } as never;
    const t = modificaApertura(pianta, "f1", { oscurante: "tapparella", cassonetto: "a_filo", motore: true });
    expect(t.aperture[0]).toMatchObject({ oscurante: "tapparella", cassonetto: "a_filo", motore: true });
    const p = modificaApertura(t, "f1", { oscurante: "persiana" });
    expect(p.aperture[0].oscurante).toBe("persiana");
    expect(p.aperture[0].cassonetto).toBeUndefined();
    expect(p.aperture[0].motore).toBeUndefined();
    const n = modificaApertura(t, "f1", { oscurante: undefined });
    expect(n.aperture[0].oscurante).toBeUndefined();
    expect(n.aperture[0].cassonetto).toBeUndefined();
    const porta = modificaApertura(t, "f1", { tipo: "porta" });
    expect(porta.aperture[0].oscurante).toBeUndefined();
  });
});

describe("computo, abaco e verifiche", () => {
  const d = doc([
    fin({ id: "f1", posizione: 100, oscurante: "tapparella", cassonetto: "a_filo", motore: true }),
    fin({ id: "f2", posizione: 300, oscurante: "tapparella" }),
    fin({ id: "f3", posizione: 500, oscurante: "persiana", ante: 2 }),
    fin({ id: "f4", posizione: 560, larghezza: 40, stato: "esistente", oscurante: "tapparella" }),
  ]);
  it("il computo conta tapparelle, cassonetti, motori, persiane e controtelai monoblocco", () => {
    const q = calcolaQuantita(d);
    const v = (s: string) => Object.entries(q).find(([k]) => k.endsWith(s))?.[1];
    expect(v("oscuranti:nuovo:tapparella.numero")?.valore).toBe(2);
    expect(v("oscuranti:nuovo:persiana.numero")?.valore).toBe(1);
    expect(v("oscuranti:nuovo:motore.numero")?.valore).toBe(1);
    expect(v("cassonetti:nuovo:a_filo.numero")?.valore).toBe(1);
    expect(v("cassonetti:nuovo:monoblocco.numero")?.valore).toBe(1);
    expect(v("serramenti:nuovo:controtelaio_monoblocco.numero")?.valore).toBe(1);
    expect(v("serramenti:nuovo:controtelaio.numero")?.valore).toBe(2);
    expect(v("struttura:nuovo:cassonetti.lunghezza_ml")?.valore).toBeCloseTo(2.76, 2);
    expect(v("struttura:nuovo:cassonetti.lunghezza_ml")?.unita).toBe("ml");
    expect(v("struttura:nuovo:oscuranti.superficie_mq")?.unita).toBe("mq");
    expect(v("struttura:nuovo:oscuranti.guide_ml")?.valore).toBeGreaterThan(4);
    // niente righe dei serramenti che non si sostituiscono per i cassonetti degli esistenti
    expect(v("cassonetti:esistente:monoblocco.numero")?.valore).toBe(1);
  });
  it("l'abaco dà oscurante e cassonetto, il riepilogo da ordinare e il CSV le colonne", () => {
    const righe = abacoSerramenti(d, "l", "fatto");
    expect(righe[0].oscurante).toMatch(/^Tapparella/);
    expect(righe[0].oscurante).toMatch(/motore/);
    expect(righe[0].cassonetto).toMatch(/Murato a filo/);
    expect(righe[2].oscurante).toBe("Persiana 2 ante");
    expect(righe[2].cassonetto).toBe("—");
    expect(righe[1].controtelaio.monoblocco).toBe(true);
    const ctrl = riepilogoControtelai(righe);
    expect(ctrl.some((x) => /monoblocco con cassonetto/.test(x.descrizione))).toBe(true);
    const osc = riepilogoOscuranti(righe);
    expect(osc.some((x) => /^Tapparella/.test(x.descrizione) && x.numero === 1)).toBe(true);
    expect(osc.some((x) => /Monoblocco/.test(x.descrizione))).toBe(true);
    // le tapparelle degli esistenti non si ordinano
    expect(osc.reduce((s, x) => s + (/^Tapparella/.test(x.descrizione) ? x.numero : 0), 0)).toBe(2);
    const csv = csvSerramenti(righe);
    expect(csv).toContain("Oscurante;Cassonetto");
    expect(csv).toContain("Persiana 2 ante");
  });
  it("sopra il vano manca il muro per il cassonetto: non conforme; con spazio va bene", () => {
    const basso = verificheDiProgetto(livello, stato(doc([fin({ altezza: 190, davanzale: 80, oscurante: "tapparella", cassonetto: "a_filo" })])));
    expect(basso.some((x) => x.codice === "serramento" && x.esito === "non_conforme" && /cassonetto/i.test(x.messaggio))).toBe(true);
    const ok = verificheDiProgetto(livello, stato(doc([fin({ oscurante: "tapparella", cassonetto: "a_filo" })])));
    expect(ok.some((x) => x.esito === "non_conforme")).toBe(false);
  });
  it("il monoblocco in un muro sottile non ci sta; l'esterno sì", () => {
    const sottile = verificheDiProgetto(livello, stato(doc([fin({ oscurante: "tapparella" })], 20)));
    expect(sottile.some((x) => x.esito === "non_conforme" && /non ci sta/.test(x.messaggio))).toBe(true);
    const esterno = verificheDiProgetto(livello, stato(doc([fin({ oscurante: "tapparella", cassonetto: "esterno" })], 20)));
    expect(esterno.some((x) => x.esito === "non_conforme")).toBe(false);
  });
  it("monoblocco che lascia poca luce, telo grande senza motore, oscurante sul tramezzo, ante larghe", () => {
    const poca = verificheDiProgetto(livello, stato(doc([fin({ altezza: 70, oscurante: "tapparella" })])));
    expect(poca.some((x) => x.esito === "non_conforme" && /luce vetrata/.test(x.messaggio))).toBe(true);
    const grande = verificheDiProgetto(livello, stato(doc([fin({ larghezza: 260, altezza: 200, davanzale: 5, oscurante: "tapparella", cassonetto: "esterno" })])));
    expect(grande.some((x) => x.esito === "attenzione" && /senza motore/.test(x.messaggio))).toBe(true);
    const motorizzata = verificheDiProgetto(livello, stato(doc([fin({ larghezza: 260, altezza: 200, davanzale: 5, oscurante: "tapparella", cassonetto: "esterno", motore: true })])));
    expect(motorizzata.some((x) => /senza motore/.test(x.messaggio))).toBe(false);
    const tram = doc([fin({ oscurante: "persiana", ante: 2 })]);
    stato(tram).muri[0] = { ...stato(tram).muri[0], tipo: "tramezzo" } as never;
    expect(verificheDiProgetto(livello, stato(tram)).some((x) => /parete interna/.test(x.messaggio))).toBe(true);
    const larghe = verificheDiProgetto(livello, stato(doc([fin({ larghezza: 240, oscurante: "persiana", ante: 2 })])));
    expect(larghe.some((x) => x.esito === "attenzione" && /troppo larghe/.test(x.messaggio))).toBe(true);
  });
});

describe("disegno", () => {
  const muroEd = { ...muro(30), p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 } } as never;
  const edit = (extra: object) => ({ ...(fin(extra) as object), posizione: 300 }) as never;
  it("2D: il cassonetto è un rettangolo tratteggiato; le persiane sono ante a 90° fuori, gli scuri dentro", () => {
    const base = segniSerramento(edit({}), muroEd).length;
    const t = segniSerramento(edit({ oscurante: "tapparella", cassonetto: "esterno" }), muroEd);
    expect(t.filter((s) => s.tipo === "linea" && s.tratteggio)).toHaveLength(4);
    expect(t.length).toBeGreaterThan(base);
    const yEst = (s: (typeof t)[number]) => (s.tipo === "linea" ? Math.max(Math.abs(s.p.y), Math.abs(s.q.y)) : 0);
    expect(Math.max(...t.map(yEst))).toBeCloseTo(15 + 22, 3);
    const p = segniSerramento(edit({ oscurante: "persiana", ante: 2 }), muroEd);
    expect(p.length - segniSerramento(edit({ ante: 2 }), muroEd).length).toBe(2);
    const fuori = segniSerramento(edit({ oscurante: "persiana", ante: 2 }), muroEd, -1);
    const lungoY = (arr: typeof p) => arr.filter((s) => s.tipo === "linea" && Math.abs(s.p.x - s.q.x) < 0.01).map((s) => (s.tipo === "linea" ? s.q.y : 0)).filter((y) => Math.abs(y) > 20);
    expect(Math.sign(lungoY(p)[0])).toBe(-Math.sign(lungoY(fuori)[0]));
    const scuri = segniSerramento(edit({ oscurante: "scuro", ante: 2 }), muroEd);
    expect(Math.sign(lungoY(scuri)[0])).toBe(-Math.sign(lungoY(p)[0]));
  });
  it("PDF/DXF: lo stesso simbolo con il cassonetto tratteggiato", () => {
    const m = { id: "m1", p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, spessore: 30, altezza: 270, stato: "nuovo" } as never;
    const a = { id: "f1", muroId: "m1", tipo: "finestra", distanza: 230, larghezza: 140, altezza: 130, davanzale: 90, manovra: "battente", cerniera: "inizio", lato: "sinistra", sistema: "battente", ante: 2, stato: "nuovo", oscurante: { tipo: "tapparella", ante: 1, cassonetto: { tipo: "a_filo", altezza: 22, profondita: 25 } } } as never;
    const prim = simboloOscurante(a, m, false, []);
    expect(prim.some((p) => p.tipo === "poligono" && p.chiuso && (p.tratto as { tratteggioMm?: number[] }).tratteggioMm)).toBe(true);
    expect(prim.length).toBe(3);
    expect(simboloOscurante({ ...(a as object), oscurante: undefined } as never, m, false, [])).toEqual([]);
  });
  it("3D: cassonetto e tapparella in un solo pezzo, persiane in legno; senza oscurante niente", () => {
    const pianta = (oscurante?: object) => daStatoPianta({ ...stato(doc([fin({ id: "f1", stato: "esistente", ...(oscurante ?? {}) })])), locali: [] } as never);
    const ids = (p: ReturnType<typeof pianta>) => costruisciScena(p, { vista: "fatto" }).mesh.filter((x) => x.id.startsWith("oscurante:"));
    expect(ids(pianta())).toHaveLength(0);
    const t = ids(pianta({ oscurante: "tapparella", cassonetto: "esterno" }));
    expect(t).toHaveLength(1);
    expect(t[0].materiale).toBe("oscurante");
    const mono = ids(pianta({ oscurante: "tapparella" }))[0];
    const filo = ids(pianta({ oscurante: "tapparella", cassonetto: "a_filo" }))[0];
    expect(mono.facce).toBeGreaterThan(0);
    expect(filo.facce).toBeGreaterThan(0);
    const ven = ids(pianta({ oscurante: "veneziana", cassonetto: "monoblocco" }))[0];
    expect(ven).toBeDefined();
    const pers = ids(pianta({ oscurante: "persiana", ante: 2 }))[0];
    expect(pers.materiale).toBe("legno");
    const pers4 = ids(pianta({ oscurante: "persiana", ante: 4 }))[0];
    expect(pers4.facce).toBeGreaterThan(pers.facce);
  });
});

describe("zanzariere", () => {
  const base = { tipo: "finestra" as const, larghezza: 140, altezza: 130, manovra: "battente" as const };
  it("solo finestre e portefinestre; senza scelta nessuna", () => {
    expect(zanzarieraAmmessa("finestra")).toBe(true);
    expect(zanzarieraAmmessa("portafinestra")).toBe(true);
    expect(zanzarieraAmmessa("porta")).toBe(false);
    expect(zanzarieraDi(base)).toBeNull();
    expect(zanzarieraDi({ ...base, zanzariera: "plisse" })).toBe("plisse");
    expect(zanzarieraDi({ ...base, tipo: "porta", zanzariera: "plisse" })).toBeNull();
    expect(misureZanzariera(base)).toBeNull();
  });
  it("misure: luce del serramento meno 2 cm per lato; guide secondo il tipo; ante sopra i 2 m", () => {
    const l = misureZanzariera({ ...base, zanzariera: "laterale" })!;
    expect(l.larghezza).toBeCloseTo(140 - 2 - 3 - 4, 5);
    expect(l.altezza).toBeCloseTo(130 - 1 - 1.5 - 4, 5);
    expect(l.guideMl).toBeCloseTo((2 * l.larghezza) / 100, 2);
    const r = misureZanzariera({ ...base, zanzariera: "verticale" })!;
    expect(r.guideMl).toBeCloseTo((2 * r.altezza) / 100, 2);
    const inc = misureZanzariera({ ...base, zanzariera: "incastro" })!;
    expect(inc.guideMl).toBeCloseTo((2 * (inc.larghezza + inc.altezza)) / 100, 2);
    expect(misureZanzariera({ ...base, larghezza: 260, zanzariera: "plisse" })!.ante).toBe(2);
    expect(l.ante).toBe(1);
  });
  it("con il cassonetto monoblocco la zanzariera è più bassa", () => {
    const senza = misureZanzariera({ ...base, zanzariera: "laterale" })!;
    const con = misureZanzariera({ ...base, zanzariera: "laterale", oscurante: "tapparella" })!;
    expect(con.altezza).toBeCloseTo(senza.altezza - 22, 5);
  });
  it("il documento la valida e il comando la toglie dalle porte", () => {
    const d = JSON.parse(JSON.stringify(trilocale));
    const a = d.livelli[0].fatto.aperture[0];
    a.zanzariera = "plisse";
    expect(validaPlanimetria(d).ok).toBe(true);
    a.zanzariera = "volante";
    expect(validaPlanimetria(d).ok).toBe(false);
    const pianta = { muri: [], aperture: [{ id: "f1", muroId: "m1", tipo: "finestra", posizione: 300, larghezza: 140, altezza: 130, davanzale: 90, manovra: "battente", verso: { cerniera: "inizio", lato: "destra" }, stato: "nuovo" }], locali: [], elementi: [], quote: [], testi: [], aree: [] } as never;
    const z = modificaApertura(pianta, "f1", { zanzariera: "laterale" });
    expect(z.aperture[0].zanzariera).toBe("laterale");
    expect(modificaApertura(z, "f1", { tipo: "porta" }).aperture[0].zanzariera).toBeUndefined();
    expect(modificaApertura(z, "f1", { zanzariera: undefined }).aperture[0].zanzariera).toBeUndefined();
  });
  it("computo, abaco e CSV", () => {
    const d = doc([
      fin({ id: "z1", posizione: 100, zanzariera: "laterale" }),
      fin({ id: "z2", posizione: 300, zanzariera: "laterale" }),
      fin({ id: "z3", posizione: 500, zanzariera: "verticale", larghezza: 100 }),
      fin({ id: "z4", posizione: 560, larghezza: 40, stato: "esistente", zanzariera: "plisse" }),
    ]);
    const q = calcolaQuantita(d);
    const v = (suffisso: string) => Object.entries(q).find(([k]) => k.endsWith(suffisso))?.[1];
    expect(v("zanzariere:nuovo:laterale.numero")?.valore).toBe(2);
    expect(v("zanzariere:nuovo:verticale.numero")?.valore).toBe(1);
    expect(v("zanzariere:esistente:plisse.numero")?.valore).toBe(1);
    expect(v("struttura:nuovo:zanzariere.superficie_mq")?.unita).toBe("mq");
    expect(v("struttura:nuovo:zanzariere.guide_ml")?.unita).toBe("ml");
    const righe = abacoSerramenti(d, "l", "fatto");
    expect(righe[0].zanzariera).toMatch(/^Zanzariera laterale/);
    expect(righe[3].zanzariera).toMatch(/plissé/);
    const rr = riepilogoOscuranti(righe);
    expect(rr.find((x) => /Zanzariera laterale/.test(x.descrizione))?.numero).toBe(2);
    expect(rr.some((x) => /plissé/.test(x.descrizione))).toBe(false);
    expect(csvSerramenti(righe)).toContain("Zanzariera");
  });
  it("verifiche: rullo largo, plissé largo, battente su finestra", () => {
    const prova = (extra: object) => verificheDiProgetto(livello, stato(doc([fin(extra)])));
    expect(prova({ larghezza: 240, zanzariera: "verticale" }).some((x) => x.esito === "attenzione" && /a rullo/.test(x.messaggio))).toBe(true);
    expect(prova({ larghezza: 140, zanzariera: "verticale" }).some((x) => /a rullo/.test(x.messaggio))).toBe(false);
    expect(prova({ larghezza: 290, zanzariera: "plisse" }).some((x) => /plissé/.test(x.messaggio))).toBe(true);
    expect(prova({ zanzariera: "battente" }).some((x) => /portefinestre/.test(x.messaggio))).toBe(true);
    expect(prova({ tipo: "portafinestra", davanzale: 0, altezza: 220, larghezza: 90, zanzariera: "battente" }).some((x) => /portefinestre|troppo larga/.test(x.messaggio))).toBe(false);
  });
  it("disegno 2D, PDF/DXF e 3D", () => {
    const muroEd = { ...muro(30), p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 } } as never;
    const edit = (extra: object) => ({ ...(fin(extra) as object), posizione: 300 }) as never;
    expect(segniZanzariera(edit({}), muroEd)).toEqual([]);
    const l = segniZanzariera(edit({ zanzariera: "laterale" }), muroEd);
    expect(l.some((x) => x.tipo === "linea" && x.tratteggio)).toBe(true);
    expect(segniZanzariera(edit({ zanzariera: "plisse" }), muroEd).length).toBeGreaterThan(l.length);
    expect(segniSerramento(edit({ zanzariera: "laterale" }), muroEd).length).toBeGreaterThan(segniSerramento(edit({}), muroEd).length);
    // l'interno è dalla parte opposta all'esterno
    const y = (arr: ReturnType<typeof segniZanzariera>) => (arr[0].tipo === "linea" ? arr[0].p.y : 0);
    expect(Math.sign(y(segniZanzariera(edit({ zanzariera: "laterale" }), muroEd, 1)))).toBe(-Math.sign(y(segniZanzariera(edit({ zanzariera: "laterale" }), muroEd, -1))));
    const m = { id: "m1", p1: { x: 0, y: 0 }, p2: { x: 600, y: 0 }, spessore: 30, altezza: 270, stato: "nuovo" } as never;
    const a = { id: "f1", muroId: "m1", tipo: "finestra", distanza: 230, larghezza: 140, altezza: 130, davanzale: 90, manovra: "battente", cerniera: "inizio", lato: "sinistra", sistema: "battente", ante: 2, stato: "nuovo", zanzariera: { tipo: "plisse" } } as never;
    expect(simboloZanzariera(a, m, false, []).length).toBe(2);
    expect(simboloZanzariera({ ...(a as object), zanzariera: undefined } as never, m, false, [])).toEqual([]);
    const pianta = (zanz?: string, osc?: string) => daStatoPianta({ ...stato(doc([fin({ id: "f1", stato: "esistente", ...(zanz ? { zanzariera: zanz } : {}), ...(osc ? { oscurante: osc } : {}) })])), locali: [] } as never);
    const z3 = (p: ReturnType<typeof pianta>) => costruisciScena(p, { vista: "fatto" }).mesh.filter((x) => x.id.startsWith("zanzariera:"));
    expect(z3(pianta())).toHaveLength(0);
    const t = z3(pianta("laterale"));
    expect(t).toHaveLength(1);
    expect(t[0].materiale).toBe("zanzariera");
    expect(z3(pianta("plisse"))[0].facce).toBeGreaterThan(t[0].facce);
    expect(z3(pianta("verticale", "tapparella"))).toHaveLength(1);
  });
});
