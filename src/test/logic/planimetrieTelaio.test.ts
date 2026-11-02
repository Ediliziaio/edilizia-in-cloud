import { describe, expect, it } from "vitest";
import { generaTelaio, leggiCampate } from "@/components/planimetrie/editor/telaio";
import { piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { MODELLI } from "@/lib/planimetrie/tred/elementi";
import { scenaEdificio } from "@/lib/planimetrie/tred/edificio";
import type { PiantaPer3D } from "@/lib/planimetrie/tred/tipi";

describe("leggiCampate", () => {
  it("legge i metri separati da punto e virgola o spazi", () => {
    expect(leggiCampate("5; 4,2; 4.5")).toEqual([500, 420, 450]);
    expect(leggiCampate("5 4")).toEqual([500, 400]);
  });
  it("rifiuta vuoto, troppo corto, troppo lungo o testo", () => {
    expect(leggiCampate("")).toBeNull();
    expect(leggiCampate("1")).toBeNull();
    expect(leggiCampate("20")).toBeNull();
    expect(leggiCampate("a; 4")).toBeNull();
  });
});

describe("generaTelaio", () => {
  const par = { campateX: [500, 400], campateY: [400], pilastro: { larghezza: 30, profondita: 30 }, trave: { larghezza: 30, altezza: 50 }, solaio: 25, origine: { x: 100, y: 100 }, stato: "nuovo" as const, etichette: true };
  it("crea 6 pilastri, 7 travi e un solaio per 2 × 1 campate", () => {
    const r = generaTelaio(piantaVuota(), par);
    const el = r.pianta.elementi ?? [];
    expect(el.filter((e) => e.tipo === "pilastro")).toHaveLength(6);
    expect(el.filter((e) => e.tipo === "trave")).toHaveLength(2 * 2 + 3);
    expect(el.filter((e) => e.tipo === "solaio")).toHaveLength(1);
    expect(r.elementi).toHaveLength(el.length);
  });
  it("i pilastri stanno sugli incroci e il solaio copre la griglia più mezzo pilastro", () => {
    const r = generaTelaio(piantaVuota(), par);
    const xs = new Set((r.pianta.elementi ?? []).filter((e) => e.tipo === "pilastro").map((e) => e.centro.x));
    expect([...xs].sort((a, b) => a - b)).toEqual([100, 600, 1000]);
    const s = (r.pianta.elementi ?? []).find((e) => e.tipo === "solaio")!;
    expect(s.larghezza).toBe(900 + 30);
    expect(s.profondita).toBe(400 + 30);
  });
  it("numeri, lettere e quote: 3 + 2 testi e 2 + 1 quote", () => {
    const r = generaTelaio(piantaVuota(), par);
    expect((r.pianta.testi ?? []).map((t) => t.testo).sort()).toEqual(["1", "2", "3", "A", "B"]);
    expect(r.pianta.quote ?? []).toHaveLength(3);
  });
  it("senza solaio e senza etichette crea solo struttura", () => {
    const r = generaTelaio(piantaVuota(), { ...par, solaio: 0, etichette: false });
    expect((r.pianta.elementi ?? []).some((e) => e.tipo === "solaio")).toBe(false);
    expect(r.pianta.testi ?? []).toHaveLength(0);
  });
});

describe("telaio in 3D", () => {
  it("la trave sta a filo con il pavimento del piano sopra", () => {
    const bl = MODELLI.trave.blocchi(4, 0.3, 0.5, { interpiano: 3.15 });
    expect(bl[0].y + bl[0].h).toBeCloseTo(3.15, 5);
    const sl = MODELLI.solaio.blocchi(8, 6, 0.25, { interpiano: 3.0 });
    expect(sl[0].y + sl[0].h).toBeCloseTo(3.0, 5);
  });
  it("nell'edificio il pilastro sale al piano sopra e le travi si adattano", () => {
    const pianta = (): PiantaPer3D => ({ muri: [], aperture: [], locali: [], elementi: [
      { id: "p", tipo: "pilastro", centro: { x: 0, y: 0 }, rotazione: 0, altezza: 300 },
      { id: "t", tipo: "trave", centro: { x: 200, y: 0 }, rotazione: 0, larghezza: 400, profondita: 30, altezza: 50 },
    ] as never });
    const piano = (id: string, quota: number) => ({ id, nome: id, quota, piante: { fatto: pianta(), progetto: pianta() } });
    const s = scenaEdificio([piano("a", 0), piano("b", 330)], { vista: "fatto" });
    const alto = (idParte: string) => Math.max(...s.mesh.filter((m) => m.id.startsWith(idParte)).flatMap((m) => m.posizioni.filter((_, i) => i % 3 === 1)));
    expect(alto("a/elemento:p")).toBeCloseTo(3.3, 2);
    expect(alto("a/elemento:t")).toBeCloseTo(3.3, 2);
  });
});

import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { copiaGruppoSuTuttiIPiani } from "@/lib/planimetrie/copiaSuiPiani";

describe("telaio: computo e piani", () => {
  const vuoto = { muri: [], aperture: [], locali: [], quote: [], testi: [] };
  const el = (id: string, tipo: string, extra: object) => ({ id, tipo, posizione: { x: 0, y: 0 }, rotazione: 0, stato: "esistente", origine: "rilevata", ...extra });
  const doc = () => ({ schemaVersione: 1, titolo: "t", livelli: [
    { id: "a", nome: "Terra", quota: 0, fatto: { ...vuoto, elementi: [el("t1", "trave", { posizione: { x: 200, y: 0 }, larghezza: 400, profondita: 30, altezza: 50 }), el("p1", "pilastro", { larghezza: 30, profondita: 30, altezza: 300 }), el("s1", "solaio", { posizione: { x: 300, y: 300 }, larghezza: 800, profondita: 600, altezza: 25 })] }, proposte: [] },
    { id: "b", nome: "Primo", quota: 300, fatto: { ...vuoto, elementi: [] }, proposte: [] },
  ] } as never);
  it("conta metri di travi, metri quadri di solaio e calcestruzzo", () => {
    const q = calcolaQuantita(doc());
    const v = (s: string) => Object.entries(q).find(([k]) => k.endsWith(s))?.[1].valore;
    expect(v("struttura:esistente:travi.lunghezza_ml")).toBeCloseTo(4, 3);
    expect(v("struttura:esistente:travi.cls_mc")).toBeCloseTo(4 * 0.3 * 0.5, 3);
    expect(v("struttura:esistente:solai.superficie_mq")).toBeCloseTo(48, 3);
    expect(v("struttura:esistente:solai.cls_mc")).toBeCloseTo(12, 3);
    expect(v("struttura:esistente:pilastri.cls_mc")).toBeCloseTo(0.27, 3);
  });
  it("il gruppo si ripete sull'altro piano", () => {
    let n = 0;
    const r = copiaGruppoSuTuttiIPiani(doc(), "a", ["t1", "p1", "s1"], () => `arredo-${++n}`);
    expect(r.aggiunti).toBe(3);
    expect(r.documento.livelli[1].fatto.elementi.map((e) => e.tipo).sort()).toEqual(["pilastro", "solaio", "trave"]);
  });
});

describe("muro di contenimento: computo", () => {
  it("metri, calcestruzzo, scavo e drenaggio", () => {
    const vuoto = { muri: [], aperture: [], locali: [], quote: [], testi: [] };
    const d = { schemaVersione: 1, titolo: "t", livelli: [{ id: "a", nome: "Terra", quota: 0, proposte: [], fatto: { ...vuoto, elementi: [
      { id: "mc", tipo: "muro_contenimento", posizione: { x: 0, y: 0 }, rotazione: 0, larghezza: 1000, profondita: 220, altezza: 300, stato: "esistente", origine: "rilevata" }] } }] } as never;
    const q = calcolaQuantita(d);
    const v = (s: string) => Object.entries(q).find(([k]) => k.endsWith(s))?.[1].valore;
    expect(v("struttura:esistente:muri_contenimento.lunghezza_ml")).toBeCloseTo(10, 3);
    // suola = max(0,3; 3/8=0,375) → 10 × (2,2 × 0,375 + 0,4 × 3) = 10 × 2,025
    expect(v("struttura:esistente:muri_contenimento.cls_mc")).toBeCloseTo(20.25, 3);
    expect(v("struttura:esistente:muri_contenimento.drenaggio_ml")).toBeCloseTo(10, 3);
    expect(v("struttura:esistente:muri_contenimento.scavo_mc")).toBeGreaterThan(20);
  });
});
