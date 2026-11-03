import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validaPlanimetria, type Livello, type Planimetria, type StatoPianta } from "../../../shared/planimetrie/modello";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { verificheDiProgetto } from "../../../shared/planimetrie/interferenze";
import { finituraDi, SUBSTRATO_VERDE_CM } from "../../../shared/planimetrie/tetto";
import { pianteDaPlanimetria, costruisciScena, scenaEdificio, pianiDaPlanimetria } from "@/lib/planimetrie/tred";
import { esplodiInStrati } from "@/lib/planimetrie/tred/esploso";
import { CostruttoreMesh } from "@/lib/planimetrie/tred/costruttore";
import { FACCIATE, ID_FACCIATE, ID_INFISSI, INFISSI, postiAlberi, sole, TRAME, uvPerProiezione } from "@/components/planimetrie/tred/aspetto";
import { prospettoQuotato, pianiProspetto } from "@/lib/planimetrie/prospetti";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));
const conTetto = (tetto: object): Planimetria => {
  const d = carica("trilocale.json");
  d.livelli[0].tetto = { pendenza: 30, sporto: 50, tipo: "due_falde", ...tetto } as never;
  return d;
};
const scena = (d: Planimetria, opz: object = {}) => costruisciScena(pianteDaPlanimetria(d).fatto, { vista: "fatto", ...opz });

describe("tetto: copertura", () => {
  it("la copertura predefinita: tegole sulle falde, guaina sul piano", () => {
    expect(finituraDi({ tipo: "due_falde" })).toBe("tegole");
    expect(finituraDi({ tipo: "piano" })).toBe("guaina");
    expect(finituraDi({ tipo: "piano", finitura: "verde" })).toBe("verde");
  });
  it("il documento accetta le coperture e rifiuta le altre", () => {
    expect(validaPlanimetria(conTetto({ finitura: "verde" })).ok).toBe(true);
    expect(validaPlanimetria(conTetto({ finitura: "lamiera" })).ok).toBe(true);
    expect(validaPlanimetria(conTetto({ finitura: "paglia" })).ok).toBe(false);
  });
  it("il 3D: tegole di sempre, tetto verde, giardino pensile con arbusti e cordolo sul tetto piano", () => {
    const mat = (d: Planimetria) => scena(d).mesh.find((m) => m.id === "tetto")?.materiale;
    expect(mat(conTetto({}))).toBe("tegole");
    expect(mat(conTetto({ tipo: "piano" }))).toBe("muro");
    expect(mat(conTetto({ finitura: "lamiera" }))).toBe("lamiera");
    expect(mat(conTetto({ tipo: "piano", finitura: "guaina" }))).toBe("guaina");
    const verde = scena(conTetto({ tipo: "piano", finitura: "verde" }));
    expect(verde.mesh.find((m) => m.id === "tetto")?.materiale).toBe("tetto_verde");
    expect(verde.mesh.some((m) => m.id === "tetto:parapetto")).toBe(true);
    expect(verde.mesh.some((m) => m.id === "tetto:vegetazione")).toBe(false);
    const pensile = scena(conTetto({ tipo: "piano", finitura: "verde_intensivo" }));
    expect(pensile.mesh.find((m) => m.id === "tetto:vegetazione")?.materiale).toBe("fogliame");
    // il substrato alza la superficie: la quota più alta del tetto verde supera quella della guaina
    const alto = (s: ReturnType<typeof scena>) => Math.max(...(s.mesh.find((m) => m.id === "tetto")!.posizioni.filter((_, i) => i % 3 === 1)));
    expect(alto(verde)).toBeCloseTo(alto(scena(conTetto({ tipo: "piano", finitura: "guaina" }))) + SUBSTRATO_VERDE_CM.verde / 100, 3);
    // sulle falde il verde non ha cordolo né arbusti
    const falde = scena(conTetto({ finitura: "verde_intensivo" }));
    expect(falde.mesh.some((m) => m.id === "tetto:parapetto" || m.id === "tetto:vegetazione")).toBe(false);
  });
  it("la vista esplosa porta con il tetto anche cordolo e arbusti", () => {
    const s = esplodiInStrati(scena(conTetto({ tipo: "piano", finitura: "verde_intensivo" })), 1.5);
    const y = (id: string) => Math.min(...s.mesh.find((m) => m.id === id)!.posizioni.filter((_, i) => i % 3 === 1));
    expect(y("tetto:parapetto")).toBeGreaterThan(3);
    expect(y("tetto:vegetazione")).toBeGreaterThan(3);
  });
  it("il computo: superficie, substrato, drenaggio e telo del tetto verde; niente se la copertura non è dichiarata", () => {
    const q = calcolaQuantita(conTetto({ tipo: "piano", finitura: "verde" }));
    const v = (s: string) => Object.entries(q).find(([k]) => k.endsWith(s))?.[1];
    const mq = v("tetto:verde.superficie_mq")!;
    expect(mq.valore).toBeGreaterThan(40);
    expect(mq.unita).toBe("mq");
    expect(v("tetto:verde.substrato_mc")!.valore).toBeCloseTo((mq.valore * SUBSTRATO_VERDE_CM.verde) / 100, 1);
    expect(v("tetto:verde.substrato_mc")!.unita).toBe("mc");
    expect(v("tetto:verde.drenaggio_mq")!.valore).toBeCloseTo(mq.valore, 1);
    expect(v("tetto:verde.telo_antiradice_mq")).toBeDefined();
    expect(Object.keys(calcolaQuantita(conTetto({ tipo: "piano" }))).some((k) => /tetto:(verde|ghiaia|guaina)/.test(k))).toBe(false);
    const pens = calcolaQuantita(conTetto({ tipo: "piano", finitura: "verde_intensivo" }));
    const sub = Object.entries(pens).find(([k]) => k.endsWith("tetto:verde_intensivo.substrato_mc"))![1].valore;
    expect(sub).toBeCloseTo((Object.entries(pens).find(([k]) => k.endsWith("tetto:verde_intensivo.superficie_mq"))![1].valore * 25) / 100, 1);
    expect(Object.entries(calcolaQuantita(conTetto({ finitura: "lamiera" }))).some(([k]) => k.endsWith("tetto:lamiera.superficie_mq"))).toBe(true);
  });
  it("le verifiche: peso del verde, pendenza, ghiaia sulle falde, tegole sul piano o troppo piatte", () => {
    const l = { id: "l", nome: "Terra", quota: 0 } as Livello;
    const prova = (tetto: object) => verificheDiProgetto({ ...l, tetto: { pendenza: 30, sporto: 50, tipo: "due_falde", ...tetto } as never }, carica("trilocale.json").livelli[0].fatto as StatoPianta).filter((x) => x.codice === "tetto");
    expect(prova({ tipo: "piano", finitura: "verde" }).some((x) => /100–150/.test(x.messaggio))).toBe(true);
    expect(prova({ tipo: "piano", finitura: "verde_intensivo" }).some((x) => /300/.test(x.messaggio))).toBe(true);
    expect(prova({ finitura: "verde", pendenza: 45 }).some((x) => /scivola/.test(x.messaggio))).toBe(true);
    expect(prova({ finitura: "verde", pendenza: 20 }).some((x) => /scivola/.test(x.messaggio))).toBe(false);
    expect(prova({ finitura: "verde_intensivo" }).some((x) => /tetto piano/.test(x.messaggio))).toBe(true);
    expect(prova({ finitura: "ghiaia" }).some((x) => x.esito === "non_conforme")).toBe(true);
    expect(prova({ pendenza: 15 }).some((x) => /infiltrazioni/.test(x.messaggio))).toBe(true);
    expect(prova({ tipo: "piano", finitura: "tegole" }).some((x) => /piano/.test(x.messaggio))).toBe(true);
    expect(prova({}).length).toBe(0);
    expect(prova({ tipo: "piano" }).length).toBe(0);
  });
  it("i prospetti colorano le falde verdi", () => {
    const doc = conTetto({ finitura: "verde" });
    const d = prospettoQuotato(pianiProspetto(doc, "fatto"), "sud");
    expect(d.primitive.some((p) => p.tipo === "poligono" && p.stile === "falda_verde")).toBe(true);
  });
});

describe("dettagli della facciata", () => {
  it("zoccolatura sui muri esterni (non alle porte), davanzali sotto le finestre, marciapiede", () => {
    const s = scena(carica("trilocale.json"));
    expect(s.mesh.some((m) => m.id.startsWith("zoccolo:"))).toBe(true);
    expect(s.mesh.some((m) => m.id.startsWith("davanzali:") && m.materiale === "davanzale")).toBe(true);
    const z = s.mesh.find((m) => m.id.startsWith("zoccolo:"))!;
    expect(Math.max(...z.posizioni.filter((_, i) => i % 3 === 1))).toBeCloseTo(0.3, 3);
    const senza = scena(carica("trilocale.json"), { zoccolo: false });
    expect(senza.mesh.some((m) => m.id.startsWith("zoccolo:") || m.id === "marciapiede")).toBe(false);
    expect(senza.mesh.some((m) => m.id.startsWith("davanzali:"))).toBe(true);
    // i muri interni non hanno la zoccolatura
    const muriZoc = s.mesh.filter((m) => m.id.startsWith("zoccolo:")).length;
    expect(muriZoc).toBeLessThan(carica("trilocale.json").livelli[0].fatto.muri.length);
  });
  it("con più piani la zoccolatura e il marciapiede sono solo del piano terra", () => {
    const base = carica("trilocale.json");
    const l0 = base.livelli[0];
    const clone = (id: string, nome: string, quota: number) => {
      const c = JSON.parse(JSON.stringify(l0));
      const suff = `_${id}`;
      const mappa = new Map<string, string>();
      for (const k of ["muri", "aperture", "locali", "elementi"] as const) for (const o of c.fatto[k] ?? []) { mappa.set(o.id, o.id + suff); o.id += suff; }
      for (const a of c.fatto.aperture) a.muroId = mappa.get(a.muroId) ?? a.muroId;
      return { ...c, id, nome, quota };
    };
    const doc = { ...base, livelli: [clone("p0", "Terra", 0), clone("p1", "Primo", 300)] } as Planimetria;
    const s = scenaEdificio(pianiDaPlanimetria(doc), { vista: "fatto" });
    expect(s.mesh.some((m) => m.id.startsWith("p0/zoccolo:"))).toBe(true);
    expect(s.mesh.some((m) => m.id.startsWith("p1/zoccolo:"))).toBe(false);
    expect(s.mesh.some((m) => m.id === "p1/marciapiede")).toBe(false);
    expect(s.mesh.some((m) => m.id.startsWith("p1/davanzali:"))).toBe(true);
  });
  it("la sfera ha facce piatte verso l'esterno", () => {
    const c = new CostruttoreMesh();
    c.sfera(1, 2, 3, 0.5, 3);
    expect(c.facce).toBeGreaterThan(10);
    for (let i = 0; i < c.normali.length; i += 3) {
      const px = c.posizioni[i] - 1, py = c.posizioni[i + 1] - 2, pz = c.posizioni[i + 2] - 3;
      // la normale punta via dal centro
      expect(px * c.normali[i] + py * c.normali[i + 1] + pz * c.normali[i + 2]).toBeGreaterThan(-1e-6);
    }
  });
});

describe("aspetto realistico: funzioni pure", () => {
  it("il sole: basso e caldo al mattino e alla sera, alto a mezzogiorno, da est a ovest passando per sud", () => {
    const mattina = sole(7), mezzo = sole(13), sera = sole(19);
    expect(mezzo.elevazioneGradi).toBeGreaterThan(55);
    expect(mattina.elevazioneGradi).toBeLessThan(10);
    expect(sera.elevazioneGradi).toBeLessThan(10);
    expect(mattina.direzione[0]).toBeLessThan(-0.9); // est
    expect(sera.direzione[0]).toBeGreaterThan(0.9); // ovest
    expect(mezzo.direzione[2]).toBeGreaterThan(0.3); // sud
    for (const s of [mattina, mezzo, sera]) expect(Math.hypot(...s.direzione)).toBeCloseTo(1, 5);
    expect(mezzo.intensita).toBeGreaterThan(mattina.intensita);
    expect(sole(3).elevazioneGradi).toBeCloseTo(sole(7).elevazioneGradi, 5);
  });
  it("gli alberi: fuori dall'ingombro, sempre gli stessi, pochi davanti", () => {
    const limiti = { min: [0, 0, 0], max: [10, 6, 8] };
    const a = postiAlberi(limiti), b = postiAlberi(limiti);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(6);
    for (const p of a) expect(p.x < 0 || p.x > 10 || p.z < 0 || p.z > 8).toBe(true);
    expect(postiAlberi({ min: [0, 0, 0], max: [0, 0, 0] })).toEqual([]);
    expect(postiAlberi({ min: [NaN, 0, 0], max: [1, 1, 1] })).toEqual([]);
    // alberi e cespugli: su qualche misura ci sono entrambi
    const varie = [8, 12, 16, 20, 26].flatMap((w) => postiAlberi({ min: [0, 0, 0], max: [w, 6, w * 0.7] }));
    expect(varie.some((p) => p.cespuglio)).toBe(true);
    expect(varie.some((p) => !p.cespuglio)).toBe(true);
  });
  it("UV: sopra x,z; sui lati la coordinata lungo il muro e l'altezza; in metri per piastrella", () => {
    const pos = [0, 0, 0, 2, 0, 0, 2, 3, 0, /* faccia su z */ 4, 5, 6 /* sopra */];
    const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0];
    const uv = uvPerProiezione(pos, nor, 2);
    expect(Array.from(uv.slice(0, 6))).toEqual([0, 0, 1, 0, 1, 1.5]);
    expect(Array.from(uv.slice(6, 8))).toEqual([2, 3]);
    const laterale = uvPerProiezione([5, 2, 7], [1, 0, 0], 1);
    expect(Array.from(laterale)).toEqual([7, 2]);
  });
  it("facciate, infissi e tessiture sono coerenti", () => {
    expect(ID_FACCIATE.length).toBe(8);
    for (const id of ID_FACCIATE) expect(TRAME[FACCIATE[id].trama]).toBeDefined();
    for (const id of ID_INFISSI) expect(INFISSI[id].colore).toMatch(/^#[0-9a-f]{6}$/);
    for (const t of Object.values(TRAME)) expect([256, 512]).toContain(t.lato);
  });
});
