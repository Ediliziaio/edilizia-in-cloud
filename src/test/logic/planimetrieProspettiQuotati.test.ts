import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { disegnoInDxf, disegnoInSvg, pianiProspetto, prospetto, prospettoQuotato, type Disegno2D, type Lato } from "@/lib/planimetrie/prospetti";
import { disegniDellaTavola } from "@/components/planimetrie/EsportaPiantaDialog";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));
const testi = (d: Disegno2D) => d.primitive.flatMap((p) => (p.tipo === "testo" ? [p.testo] : []));
const lati: Lato[] = ["sud", "nord", "est", "ovest"];

/** Il trilocale su tre piani: stessa pianta a 0, 3 e 6 m, con una tapparella e un cassonetto esterno al piano terra. */
function edificio(): Planimetria {
  const base = carica("trilocale.json");
  const l0 = JSON.parse(JSON.stringify(base.livelli[0]));
  const clone = (id: string, nome: string, quota: number) => ({ ...JSON.parse(JSON.stringify(l0)), id, nome, quota });
  const doc = { ...base, livelli: [clone("p0", "Piano terra", 0), clone("p1", "Primo piano", 300), clone("p2", "Secondo piano", 600)] } as Planimetria;
  const fin = doc.livelli[0].fatto.aperture.find((a) => a.tipo === "finestra")!;
  Object.assign(fin, { oscurante: "tapparella", cassonetto: "esterno", ante: 2 });
  return doc;
}

describe("prospetti quotati", () => {
  it("un piano solo: pareti, vani, catena di quote e totale", () => {
    const doc = carica("trilocale.json");
    const d = prospettoQuotato(pianiProspetto(doc, "fatto"), "sud");
    expect(d.primitive.some((p) => p.tipo === "rett" && p.stile === "muro")).toBe(true);
    expect(d.primitive.filter((p) => p.tipo === "linea" && p.stile === "richiamo").length).toBeGreaterThan(4);
    expect(d.primitive.filter((p) => p.tipo === "testo" && p.stile === "quota").length).toBeGreaterThan(2);
    expect(d.titolo).toBe("Prospetto sud");
  });

  it("la catena quotata somma al totale e il totale è la larghezza del prospetto", () => {
    const doc = carica("trilocale.json");
    for (const lato of lati) {
      const d = prospettoQuotato(pianiProspetto(doc, "fatto"), lato);
      const grezzo = prospetto(doc.livelli[0].fatto, lato);
      const muri = d.primitive.filter((p) => p.tipo === "rett" && p.stile === "muro");
      if (!muri.length) continue;
      const orizz = d.primitive.filter((p) => p.tipo === "testo" && p.stile === "quota" && !p.ruota).map((p) => (p.tipo === "testo" ? Number(p.testo) : 0));
      const totale = Math.max(...orizz);
      const larghezza = Math.max(...muri.map((p) => (p.tipo === "rett" ? p.u2 : 0))) - Math.min(...muri.map((p) => (p.tipo === "rett" ? p.u1 : 0)));
      expect(totale).toBeCloseTo(larghezza, 0);
      // la parziale non supera il totale (i tratti sotto i 30 cm non hanno il numero)
      const parziali = orizz.filter((x) => x !== totale);
      expect(parziali.reduce((t, x) => t + x, 0)).toBeLessThanOrEqual(totale + 1);
      expect(grezzo.primitive.length).toBeGreaterThan(0);
    }
  });

  it("tre piani: quote di piano, solai, tetto solo in cima e altezza totale", () => {
    const doc = edificio();
    const d = prospettoQuotato(pianiProspetto(doc, "fatto"), "sud");
    const t = testi(d);
    expect(t.some((x) => x.startsWith("±0,00 Piano terra"))).toBe(true);
    expect(t.some((x) => x.startsWith("+3,00 Primo piano"))).toBe(true);
    expect(t.some((x) => x.startsWith("+6,00 Secondo piano"))).toBe(true);
    expect(d.titolo).toBe("Prospetto sud");
    expect(d.primitive.some((p) => p.tipo === "testo" && p.stile === "titolo" && /tutto l'edificio/.test(p.testo))).toBe(true);
    // un solo piano: nessun «tutto l'edificio»
    expect(prospettoQuotato(pianiProspetto(carica("trilocale.json"), "fatto"), "sud").primitive.some((p) => p.tipo === "testo" && /tutto l'edificio/.test(p.testo))).toBe(false);
    // l'altezza totale supera i 6 m (due piani sotto + quello in cima)
    expect(d.maxZ).toBeGreaterThanOrEqual(600 + 250);
    // un muro per piano
    const muri = d.primitive.filter((p) => p.tipo === "rett" && p.stile === "muro");
    expect(muri.some((p) => p.tipo === "rett" && p.z1 >= 600)).toBe(true);
    expect(muri.some((p) => p.tipo === "rett" && p.z1 >= 300 && p.z1 < 600)).toBe(true);
  });

  it("codici e misure sui serramenti, simboli di apertura, cassonetto e tapparella", () => {
    const doc = edificio();
    const tutte = lati.flatMap((l) => prospettoQuotato(pianiProspetto(doc, "fatto"), l).primitive);
    const etichette = tutte.flatMap((p) => (p.tipo === "testo" && p.stile === "etichetta" ? [p.testo] : []));
    expect(etichette.some((x) => /^F\d+$/.test(x))).toBe(true);
    expect(etichette.some((x) => /^PF?\d+$/.test(x))).toBe(true);
    expect(etichette.some((x) => /^\d+×\d+$/.test(x))).toBe(true);
    expect(tutte.some((p) => p.tipo === "linea" && p.stile === "apertura")).toBe(true);
    expect(tutte.some((p) => p.tipo === "rett" && p.stile === "cassonetto")).toBe(true);
    expect(tutte.some((p) => p.tipo === "linea" && p.stile === "lamella")).toBe(true);
    expect(tutte.some((p) => p.tipo === "linea" && p.stile === "montante")).toBe(true);
  });

  it("le persiane chiuse e il cassonetto a filo si vedono; senza oscuranti niente", () => {
    const doc = edificio();
    const fin = doc.livelli[0].fatto.aperture.filter((a) => a.tipo === "finestra");
    Object.assign(fin[0], { oscurante: "persiana", cassonetto: undefined, ante: 2 });
    if (fin[1]) Object.assign(fin[1], { oscurante: "tapparella", cassonetto: "a_filo" });
    const tutte = lati.flatMap((l) => prospettoQuotato(pianiProspetto(doc, "fatto"), l).primitive);
    expect(tutte.some((p) => p.tipo === "rett" && p.stile === "persiana")).toBe(true);
    expect(tutte.some((p) => p.tipo === "rett" && p.stile === "cassonetto_nascosto")).toBe(true);
    const nuda = lati.flatMap((l) => prospettoQuotato(pianiProspetto(carica("trilocale.json"), "fatto"), l).primitive);
    expect(nuda.some((p) => p.tipo === "rett" && (p.stile === "persiana" || p.stile === "cassonetto" || p.stile === "cassonetto_nascosto"))).toBe(false);
  });

  it("quote verticali dei vani a destra: davanzale, luce, architrave", () => {
    const doc = carica("trilocale.json");
    const d = prospettoQuotato(pianiProspetto(doc, "fatto"), "nord");
    const verticali = d.primitive.filter((p) => p.tipo === "testo" && p.stile === "quota" && p.ruota);
    expect(verticali.length).toBeGreaterThanOrEqual(2);
  });

  it("SVG in scala con testi ruotati e DXF a layer", () => {
    const d = prospettoQuotato(pianiProspetto(edificio(), "fatto"), "sud");
    const { svg } = disegnoInSvg(d, 100);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("rotate(-90");
    expect(svg).toContain("Piano terra");
    const dxf = new TextDecoder().decode(disegnoInDxf(d));
    expect(dxf).toContain("QUOTE");
    expect(dxf).toContain("EOF");
    expect(dxf).not.toContain("NaN");
    expect(svg).not.toContain("NaN");
  });

  it("senza pareti o con tutte da demolire: disegno vuoto, senza errori", () => {
    expect(prospettoQuotato([], "sud").primitive).toHaveLength(0);
    const doc = carica("trilocale.json");
    for (const m of doc.livelli[0].fatto.muri) (m as { stato: string }).stato = "da_demolire";
    expect(prospettoQuotato(pianiProspetto(doc, "fatto"), "sud").primitive).toHaveLength(0);
  });

  it("la tavola completa esce quotata, e con più piani di tutto l'edificio", () => {
    const doc = edificio();
    const uno = disegniDellaTavola(doc.livelli[0].fatto);
    expect(uno.map((d) => d.titolo)).toEqual(["Prospetto sud", "Prospetto nord", "Prospetto est", "Prospetto ovest", "Sezione A-A"]);
    expect(uno[0].primitive.some((p) => p.tipo === "testo" && p.stile === "quota")).toBe(true);
    const tre = disegniDellaTavola(doc.livelli[0].fatto, undefined, pianiProspetto(doc, "fatto"));
    expect(tre).toHaveLength(5);
    expect(tre[0].maxZ).toBeGreaterThan(uno[0].maxZ + 500);
  });

  it("con un piano solo la quota di piano è senza nome", () => {
    const d = prospettoQuotato([{ id: "c", nome: "", quota: 0, stato: carica("trilocale.json").livelli[0].fatto }], "sud");
    expect(testi(d)).toContain("±0,00");
  });
});
