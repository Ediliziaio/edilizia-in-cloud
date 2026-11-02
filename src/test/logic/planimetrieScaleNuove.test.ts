import { describe, expect, it } from "vitest";
import { MODELLI } from "@/lib/planimetrie/tred/elementi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { TIPI_SU_TUTTI_I_PIANI } from "@/lib/planimetrie/copiaSuiPiani";

const alto = (bl: Array<{ y: number; h: number }>) => Math.max(...bl.map((x) => x.y + x.h));

describe("scale a U e a chiocciola", () => {
  it("la scala a U arriva esattamente al piano sopra, a metà sul pianerottolo, con pedata ≈ 25 cm", () => {
    const h = 3.15;
    const bl = MODELLI.scala_u.blocchi(2.0, 3.6, h);
    expect(alto(bl)).toBeCloseTo(h, 5);
    const n = Math.round(h / 0.175);
    const pianerottolo = bl.find((x) => x.l === 2.0)!;
    expect(pianerottolo.h).toBeCloseTo((h / n) * Math.floor(n / 2), 5);
    const gradino = bl.find((x) => x.l < 2.0)!;
    expect(gradino.p).toBeGreaterThan(0.2);
    expect(gradino.p).toBeLessThan(0.3);
  });
  it("le due rampe non si sovrappongono", () => {
    const bl = MODELLI.scala_u.blocchi(2.0, 3.6, 2.8).filter((x) => x.l < 2.0);
    const a = bl.filter((x) => x.x < 0), b = bl.filter((x) => x.x > 0);
    expect(a.length).toBeGreaterThan(3);
    expect(b.length).toBeGreaterThan(3);
    expect(Math.max(...a.map((x) => x.x + x.l / 2))).toBeLessThan(Math.min(...b.map((x) => x.x - x.l / 2)));
  });
  it("la chiocciola sale col palo e un gradino per alzata, ruotando", () => {
    const h = 3.0;
    const bl = MODELLI.scala_chiocciola.blocchi(1.6, 1.6, h);
    expect(bl.filter((x) => x.materiale === "legno").length).toBe(Math.round(h / 0.175));
    expect(alto(bl)).toBeCloseTo(h, 2);
    const angoli = bl.filter((x) => x.girata !== undefined).map((x) => x.girata!);
    expect(new Set(angoli.map((a) => a.toFixed(3))).size).toBe(angoli.length);
  });
  it("sono nel catalogo e si ripetono su tutti i piani", () => {
    expect(CATALOGO.some((c) => c.tipo === "scala_u")).toBe(true);
    expect(CATALOGO.some((c) => c.tipo === "scala_chiocciola")).toBe(true);
    expect(TIPI_SU_TUTTI_I_PIANI).toContain("scala_u");
  });
});

import { meshFondazioni } from "@/lib/planimetrie/tred/scena";
import { scenaEdificio } from "@/lib/planimetrie/tred/edificio";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import type { PiantaPer3D } from "@/lib/planimetrie/tred/tipi";

describe("fondazioni", () => {
  const pianta = (): PiantaPer3D => ({
    muri: [
      { id: "m1", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" },
      { id: "m2", a: { x: 0, y: 200 }, b: { x: 500, y: 200 }, spessore: 10, altezza: 270, stato: "esistente" },
    ] as never, aperture: [], locali: [],
    elementi: [{ id: "p1", tipo: "pilastro", centro: { x: 250, y: 100 }, rotazione: 0 }] as never,
  });
  it("un cordolo sotto il muro portante, nessuno sotto il tramezzo, un plinto sotto il pilastro, tutto sottoterra", () => {
    const f = meshFondazioni(pianta())!;
    expect(f).not.toBeNull();
    const ys = f.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.0001);
    expect(Math.min(...ys)).toBeCloseTo(-0.6, 3);
    // 2 scatole (cordolo + plinto) da 6 facce da 4 vertici
    expect(f.posizioni.length / 3).toBe(2 * 24);
  });
  it("nell'edificio compaiono solo sotto il piano più basso", () => {
    const piano = (id: string, quota: number) => ({ id, nome: id, quota, piante: { fatto: pianta(), progetto: pianta() } });
    const s = scenaEdificio([piano("t", 0), piano("p", 300)], { vista: "fatto", fondazioni: true });
    expect(s.mesh.filter((m) => m.id.endsWith("/fondazioni")).map((m) => m.id)).toEqual(["t/fondazioni"]);
  });
  it("il computo stima cordolo, calcestruzzo e scavo solo per le pareti nuove portanti", () => {
    const vuoto = { aperture: [], locali: [], elementi: [], quote: [], testi: [] };
    const muro = (id: string, tipo: string, stato: string) => ({ id, p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, spessore: 30, altezza: 270, tipo, stato, origine: "rilevata" });
    const doc = { schemaVersione: 1, titolo: "t", livelli: [{ id: "l", nome: "Terra", quota: 0, fatto: { ...vuoto, muri: [muro("a", "portante", "esistente")] },
      proposte: [{ id: "A", nome: "A", ...vuoto, muri: [muro("a", "portante", "esistente"), muro("b", "portante", "nuovo"), muro("c", "tramezzo", "nuovo")] }] }] } as never;
    const q = calcolaQuantita(doc);
    const v = (suffisso: string) => Object.entries(q).find(([k]) => k.endsWith(suffisso))?.[1].valore;
    expect(v("fondazioni:cordolo.lunghezza_ml")).toBeCloseTo(10, 3);
    expect(v("fondazioni:cordolo.cls_mc")).toBeCloseTo(10 * 0.7 * 0.5, 3);
    expect(Object.keys(q).some((k) => k.startsWith("fatto:") && k.includes("fondazioni"))).toBe(false);
  });
});

describe("muro di contenimento", () => {
  it("fusto fuori terra alto H, suola sottoterra, terreno sul retro e punta davanti", () => {
    const bl = MODELLI.muro_contenimento.blocchi(6, 2.2, 3.0);
    const fusto = bl.filter((x) => x.materiale === "calcestruzzo" && x.y >= 0);
    expect(Math.max(...fusto.map((x) => x.y + x.h))).toBeCloseTo(3.0, 5);
    const suola = bl.find((x) => x.y < 0)!;
    expect(suola.y + suola.h).toBeCloseTo(0, 5);
    expect(suola.p).toBeCloseTo(2.2, 5);
    // il fusto sta davanti al centro (la punta è corta), il terreno dietro
    const zFusto = fusto[0].z, zTerra = bl.find((x) => x.materiale === "terra")!.z;
    expect(zFusto).toBeGreaterThan(0);
    expect(zTerra).toBeLessThan(0);
    // rastremato: più sottile in cima
    expect(fusto[fusto.length - 1].p).toBeLessThan(fusto[0].p);
  });
});
