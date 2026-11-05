import { describe, expect, it } from "vitest";
import { costruisciScena } from "@/lib/planimetrie/tred";
import { meshImpianti } from "@/lib/planimetrie/tred/impianti3d";
import { esplodiInStrati, stratoDi } from "@/lib/planimetrie/tred/esploso";
import type { Mesh3D, PiantaPer3D } from "@/lib/planimetrie/tred/tipi";

const el = (id: string, tipo: string, x: number, y: number) => ({ id, tipo, centro: { x, y }, rotazione: 0 });
const rett = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const base = (elementi: ReturnType<typeof el>[]): PiantaPer3D => ({
  muri: [
    { id: "m1", a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "m2", a: { x: 500, y: 0 }, b: { x: 500, y: 400 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "m3", a: { x: 500, y: 400 }, b: { x: 0, y: 400 }, spessore: 30, altezza: 270, stato: "esistente" },
    { id: "m4", a: { x: 0, y: 400 }, b: { x: 0, y: 0 }, spessore: 30, altezza: 270, stato: "esistente" },
  ],
  aperture: [],
  locali: [{ id: "s", nome: "Soggiorno", destinazione: "soggiorno", contorno: rett(0, 0, 500, 400), altezza: 270 }],
  elementi,
});
const maxY = (m: Mesh3D) => { let y = -Infinity; for (let i = 1; i < m.posizioni.length; i += 3) y = Math.max(y, m.posizioni[i]); return y; };

describe("tubazioni e cavi in 3D", () => {
  const pianta = base([el("q", "quadro_elettrico", 50, 50), el("p1", "presa", 450, 50), el("p2", "presa", 450, 350), el("c", "collettore", 60, 350), el("l", "lavabo", 300, 380), el("cs", "colonna_scarico", 480, 380)]);

  it("una linea per ogni impianto presente, ognuna col suo colore e i suoi metri", () => {
    const r = meshImpianti(pianta);
    const linee = r.impianti.map((i) => i.linea).sort();
    expect(linee).toEqual(["acqua", "elettrica", "scarico"]);
    expect(r.mesh.map((m) => m.materiale).sort()).toEqual(["impianto_acqua", "impianto_elettrica", "impianto_scarico"]);
    for (const i of r.impianti) expect(i.metri).toBeGreaterThan(0);
    // i metri sono quelli del computo: stesse stime del 2D
    const el = r.impianti.find((i) => i.linea === "elettrica")!;
    expect(el.metri).toBeGreaterThan(4);
  });

  it("le calate arrivano alla quota del simbolo: il quadro a 1,60 m", () => {
    const r = meshImpianti(base([el("q", "quadro_elettrico", 50, 50), el("p1", "presa", 450, 50)]));
    const m = r.mesh.find((x) => x.materiale === "impianto_elettrica")!;
    expect(maxY(m)).toBeCloseTo(1.6, 2);
  });

  it("senza quadro avvisa e non disegna quella linea", () => {
    const r = meshImpianti(base([el("p1", "presa", 450, 50)]));
    expect(r.mesh).toHaveLength(0);
    expect(r.avvisi.join(" ")).toMatch(/quadro elettrico/);
  });

  it("senza richiesta la scena non ha impianti; con richiesta li ha e si vedono nei limiti", () => {
    const senza = costruisciScena(pianta, {});
    expect(senza.impianti).toBeUndefined();
    expect(senza.mesh.some((m) => m.id.startsWith("impianto:"))).toBe(false);
    const con = costruisciScena(pianta, { impianti: true });
    expect(con.impianti?.length).toBe(3);
    expect(con.mesh.some((m) => m.id === "impianto:acqua")).toBe(true);
    expect(con.materiali.impianto_acqua).toBeTruthy();
  });

  it("nella vista esplosa le tubazioni stanno a metà fra pavimento e pareti", () => {
    expect(stratoDi({ id: "impianto:acqua", riferimento: "impianto:acqua", genere: "elemento" })).toBe(0.5);
    const con = costruisciScena(pianta, { impianti: true, soffitto: true });
    const es = esplodiInStrati(con, 1.5);
    const prima = con.mesh.find((m) => m.id === "impianto:acqua")!;
    const dopo = es.mesh.find((m) => m.id === "impianto:acqua")!;
    expect(maxY(dopo)).toBeCloseTo(maxY(prima) + 0.5 * 1.5, 6);
    expect(es.impianti).toEqual(con.impianti);
  });
});
