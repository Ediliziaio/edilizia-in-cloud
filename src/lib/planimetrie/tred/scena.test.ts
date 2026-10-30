import { describe, expect, it } from "vitest";
import { BILOCALE_ESEMPIO, costruisciScena, daPlanimetria, limitiDi, type Mesh3D, type PiantaPer3D } from "./index";
import { triangola, v2 } from "./geometria2d";

const vuota = (): PiantaPer3D => ({ muri: [], aperture: [], locali: [], elementi: [] });

/** Volume racchiuso (teorema della divergenza): torna solo se la superficie è chiusa e le normali guardano fuori. */
function volume(mesh: Mesh3D[]): number {
  let v = 0;
  for (const m of mesh) {
    const p = m.posizioni;
    for (let i = 0; i < m.indici.length; i += 3) {
      const [a, b, c] = [m.indici[i] * 3, m.indici[i + 1] * 3, m.indici[i + 2] * 3];
      v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
  }
  return v / 6;
}

/** Le normali dichiarate concordano con il verso dei triangoli (lato visibile giusto). */
function normaliCoerenti(m: Mesh3D): boolean {
  const p = m.posizioni;
  for (let i = 0; i < m.indici.length; i += 3) {
    const [a, b, c] = [m.indici[i] * 3, m.indici[i + 1] * 3, m.indici[i + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const dich = [m.normali[a], m.normali[a + 1], m.normali[a + 2]];
    if (n[0] * dich[0] + n[1] * dich[1] + n[2] * dich[2] <= 0) return false;
  }
  return true;
}

/** Il punto (x, y, z) cade su un triangolo della mesh che giace sul piano z = costante? */
function copertoSulPianoZ(m: Mesh3D, x: number, y: number, z: number): boolean {
  const p = m.posizioni;
  for (let i = 0; i < m.indici.length; i += 3) {
    const t = [m.indici[i], m.indici[i + 1], m.indici[i + 2]].map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
    if (!t.every((q) => Math.abs(q[2] - z) < 1e-9)) continue;
    const s = (a: number[], b: number[]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const d1 = s(t[0], t[1]), d2 = s(t[1], t[2]), d3 = s(t[2], t[0]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

const muroSolo = (aperture: PiantaPer3D["aperture"] = []): PiantaPer3D => ({
  ...vuota(),
  muri: [{ id: "m", a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" }],
  aperture,
});

const rettangolo = (): PiantaPer3D => ({
  ...vuota(),
  muri: [
    { id: "n", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "e", a: { x: 500, y: 0 }, b: { x: 500, y: 400 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "s", a: { x: 500, y: 400 }, b: { x: 0, y: 400 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "o", a: { x: 0, y: 400 }, b: { x: 0, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" },
  ],
});

describe("muro singolo", () => {
  it("senza aperture è un parallelepipedo: 6 facce, 12 triangoli, misure della pianta", () => {
    const s = costruisciScena(muroSolo());
    expect(s.mesh).toHaveLength(1);
    expect(s.mesh[0].facce).toBe(6);
    expect(s.mesh[0].indici.length / 3).toBe(12);
    expect(s.limiti.min).toEqual([0, 0, -0.15]);
    expect(s.limiti.max).toEqual([4, 2.7, 0.15]);
    expect(volume(s.mesh)).toBeCloseTo(4 * 0.3 * 2.7, 9);
    expect(normaliCoerenti(s.mesh[0])).toBe(true);
  });

  it("una finestra fa un buco con spallette, architrave e davanzale (16 facce)", () => {
    const s = costruisciScena(muroSolo([{ id: "f", muroId: "m", tipo: "finestra", posizione: 200, larghezza: 120, altezza: 140, davanzale: 100, stato: "esistente" }]));
    const muro = s.mesh.find((m) => m.genere === "muro")!;
    // 2 facce lunghe × (colonna sinistra, sotto, sopra, colonna destra) + 2 spallette + architrave + davanzale + sopra + sotto + 2 testate
    expect(muro.facce).toBe(16);
    expect(volume([muro])).toBeCloseTo(4 * 0.3 * 2.7 - 1.2 * 0.3 * 1.4, 9);
    expect(normaliCoerenti(muro)).toBe(true);
    // Il centro della finestra, sulla faccia del muro, è vuoto; sotto il davanzale è pieno.
    expect(copertoSulPianoZ(muro, 2, 1.7, 0.15)).toBe(false);
    expect(copertoSulPianoZ(muro, 2, 0.5, 0.15)).toBe(true);
    expect(copertoSulPianoZ(muro, 0.5, 1.7, -0.15)).toBe(true);
    // Il vetro c'è, visibile dai due lati.
    const vetro = s.mesh.find((m) => m.genere === "vetro")!;
    expect(vetro.facce).toBe(2);
    expect(limitiDi([vetro])).toEqual({ min: [1.4, 1, 0], max: [2.6, 2.4, 0] });
  });

  it("una porta arriva a terra: niente davanzale, il fondo del muro si interrompe (14 facce)", () => {
    const s = costruisciScena(muroSolo([{ id: "p", muroId: "m", tipo: "porta", posizione: 100, larghezza: 80, altezza: 210, davanzale: 0, stato: "esistente" }]));
    const muro = s.mesh.find((m) => m.genere === "muro")!;
    expect(muro.facce).toBe(14);
    expect(volume([muro])).toBeCloseTo(4 * 0.3 * 2.7 - 0.8 * 0.3 * 2.1, 9);
    expect(s.mesh.some((m) => m.genere === "vetro")).toBe(false);
  });

  it("un'apertura che esce dal muro viene ridotta e segnalata", () => {
    const s = costruisciScena(muroSolo([{ id: "x", muroId: "m", tipo: "finestra", posizione: 380, larghezza: 100, altezza: 100, davanzale: 100, stato: "esistente" }]));
    expect(s.avvisi.join(" ")).toMatch(/esce dal muro/);
    expect(volume(s.mesh.filter((m) => m.genere === "muro"))).toBeGreaterThan(4 * 0.3 * 2.7 - 1 * 0.3 * 1);
  });
});

describe("incroci", () => {
  it("negli angoli le facce si incontrano senza buchi: il volume è impronta × altezza", () => {
    const s = costruisciScena(rettangolo());
    expect(s.mesh).toHaveLength(4);
    // niente testate: ogni muro ha 2 facce lunghe, sopra e sotto
    expect(s.mesh.every((m) => m.facce === 4)).toBe(true);
    expect(s.limiti.min[0]).toBeCloseTo(-0.15, 9);
    expect(s.limiti.min[2]).toBeCloseTo(-0.15, 9);
    expect(s.limiti.max[0]).toBeCloseTo(5.15, 9);
    expect(s.limiti.max[2]).toBeCloseTo(4.15, 9);
    const impronta = 5.3 * 4.3 - 4.7 * 3.7;
    expect(volume(s.mesh)).toBeCloseTo(impronta * 2.7, 9);
    expect(s.mesh.every(normaliCoerenti)).toBe(true);
  });

  it("un tramezzo appoggiato su un muro si ferma sulla sua faccia", () => {
    const p = rettangolo();
    p.muri.push({ id: "t", a: { x: 250, y: 0 }, b: { x: 250, y: 400 }, spessore: 10, altezza: 270, stato: "esistente" });
    const s = costruisciScena(p);
    const t = s.mesh.find((m) => m.riferimento === "t")!;
    const l = limitiDi([t]);
    expect(l.min[2]).toBeCloseTo(0.15, 9);
    expect(l.max[2]).toBeCloseTo(3.85, 9);
    expect(l.min[0]).toBeCloseTo(2.45, 9);
    expect(l.max[0]).toBeCloseTo(2.55, 9);
    // niente testate: le teste sono contro i muri
    expect(t.facce).toBe(4);
  });

  it("tre muri nello stesso punto: il centro dell'incrocio è chiuso sopra e sotto", () => {
    const p: PiantaPer3D = {
      ...vuota(),
      muri: [
        { id: "a", a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, spessore: 20, altezza: 270, stato: "esistente" },
        { id: "b", a: { x: 300, y: 0 }, b: { x: 600, y: 0 }, spessore: 20, altezza: 270, stato: "esistente" },
        { id: "c", a: { x: 300, y: 0 }, b: { x: 300, y: 300 }, spessore: 20, altezza: 270, stato: "esistente" },
      ],
    };
    const s = costruisciScena(p);
    const nodo = s.mesh.find((m) => m.genere === "nodo")!;
    expect(nodo).toBeDefined();
    // Volume di tutto = impronta della T × altezza (le testate libere chiudono le estremità).
    const impronta = 6 * 0.2 + 0.2 * 2.9;
    expect(volume(s.mesh)).toBeCloseTo(impronta * 2.7, 9);
  });
});

describe("stato di fatto, progetto e colori", () => {
  const pianta = daPlanimetria(BILOCALE_ESEMPIO);

  it("il fatto non ha i muri nuovi, il progetto non ha quelli da demolire", () => {
    const fatto = costruisciScena(pianta, { vista: "fatto" });
    const progetto = costruisciScena(pianta, { vista: "progetto" });
    const ids = (s: typeof fatto) => s.mesh.filter((m) => m.genere === "muro").map((m) => m.riferimento).sort();
    expect(ids(fatto)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m8"]);
    expect(ids(progetto)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7"]);
    expect(fatto.mesh.every((m) => m.materiale !== "muro_nuovo" && m.materiale !== "muro_demolire")).toBe(true);
  });

  it("il confronto colora giallo le demolizioni e rosso le opere nuove", () => {
    const s = costruisciScena(pianta, { vista: "confronto" });
    expect(s.mesh.find((m) => m.riferimento === "m8" && m.genere === "muro")!.materiale).toBe("muro_demolire");
    expect(s.mesh.find((m) => m.riferimento === "m7" && m.genere === "muro")!.materiale).toBe("muro_nuovo");
    // porta da chiudere → tamponamento rosso; porta nuova in muro esistente → spallette gialle
    expect(s.mesh.find((m) => m.genere === "tamponamento")!.riferimento).toBe("p5");
    expect(s.mesh.find((m) => m.genere === "vano")!.riferimento).toBe("p4");
  });

  it("il soffitto si può togliere", () => {
    expect(costruisciScena(pianta).mesh.filter((m) => m.genere === "soffitto")).toHaveLength(4);
    expect(costruisciScena(pianta, { soffitto: false }).mesh.filter((m) => m.genere === "soffitto")).toHaveLength(0);
  });
});

describe("bilocale d'esempio", () => {
  const pianta = daPlanimetria(BILOCALE_ESEMPIO);
  const s = costruisciScena(pianta, { vista: "confronto" });

  it("nessun avviso e le misure esterne sono quelle della pianta (9,30 × 6,80 × 2,70 m)", () => {
    expect(s.avvisi).toEqual([]);
    const muri = limitiDi(s.mesh, (g) => g === "muro");
    expect(muri.min[0]).toBeCloseTo(-0.15, 9);
    expect(muri.max[0]).toBeCloseTo(9.15, 9);
    expect(muri.min[2]).toBeCloseTo(-0.15, 9);
    expect(muri.max[2]).toBeCloseTo(6.65, 9);
    expect(muri.max[1]).toBeCloseTo(2.7, 9);
  });

  it("i pavimenti coprono esattamente la superficie dei locali", () => {
    for (const l of pianta.locali) {
      const pav = s.mesh.find((m) => m.id === `pavimento:${l.id}`)!;
      let area = 0;
      const p = pav.posizioni;
      for (let i = 0; i < pav.indici.length; i += 3) {
        const [a, b, c] = [pav.indici[i] * 3, pav.indici[i + 1] * 3, pav.indici[i + 2] * 3];
        area += Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (p[b + 2] - p[a + 2])) / 2;
      }
      const xs = l.contorno.map((q) => q.x);
      const ys = l.contorno.map((q) => q.y);
      const atteso = ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 1e4;
      expect(area).toBeCloseTo(atteso, 9);
      expect(normaliCoerenti(pav)).toBe(true);
    }
  });

  it("ogni finestra e portafinestra ha il suo vetro, le porte no", () => {
    const vetri = s.mesh.filter((m) => m.genere === "vetro" && !m.id.startsWith("elemento")).map((m) => m.riferimento).sort();
    expect(vetri).toEqual(["f1", "f2", "f3", "f4", "pf1"]);
  });

  it("tutte le facce hanno il lato visibile giusto", () => {
    expect(s.mesh.filter((m) => !normaliCoerenti(m)).map((m) => m.nome)).toEqual([]);
  });
});

describe("triangolazione", () => {
  it("un locale a L si triangola senza perdere superficie", () => {
    const L = [v2(0, 0), v2(4, 0), v2(4, 2), v2(2, 2), v2(2, 4), v2(0, 4)];
    const tri = triangola(L);
    expect(tri).toHaveLength(4);
    const area = tri.reduce((s, [i, j, k]) => s + Math.abs((L[j].x - L[i].x) * (L[k].y - L[i].y) - (L[k].x - L[i].x) * (L[j].y - L[i].y)) / 2, 0);
    expect(area).toBeCloseTo(12, 9);
  });
});
