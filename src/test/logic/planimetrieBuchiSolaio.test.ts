import { describe, expect, it } from "vitest";
import { poligonoConBuchi, triangola, v2, type V2 } from "@/lib/planimetrie/tred/geometria2d";
import { scenaEdificio, type PianoPer3D } from "@/lib/planimetrie/tred/edificio";
import type { PiantaPer3D } from "@/lib/planimetrie/tred/tipi";

const rett = (x0: number, y0: number, x1: number, y1: number): V2[] => [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)];
const area = (p: V2[]) => Math.abs(p.reduce((s, q, i) => s + (q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y), 0)) / 2;
const areaTriangoli = (p: V2[]) => triangola(p).reduce((s, [a, b, c]) => s + area([p[a], p[b], p[c]]), 0);

describe("poligono con buchi", () => {
  it("un buco nel mezzo toglie esattamente la sua area", () => {
    const p = poligonoConBuchi(rett(0, 0, 10, 10), [rett(4, 4, 6, 6)]);
    expect(areaTriangoli(p)).toBeCloseTo(100 - 4, 6);
  });
  it("due buchi", () => {
    const p = poligonoConBuchi(rett(0, 0, 10, 8), [rett(1, 1, 3, 3), rett(6, 4, 8, 7)]);
    expect(areaTriangoli(p)).toBeCloseTo(80 - 4 - 6, 6);
  });
  it("buco in una stanza a L", () => {
    const L = [v2(0, 0), v2(10, 0), v2(10, 4), v2(4, 4), v2(4, 10), v2(0, 10)];
    const p = poligonoConBuchi(L, [rett(1, 6, 3, 8)]);
    expect(areaTriangoli(p)).toBeCloseTo(64 - 4, 6);
  });
  it("un buco fuori dal contorno si ignora", () => {
    const p = poligonoConBuchi(rett(0, 0, 10, 10), [rett(20, 20, 22, 22)]);
    expect(areaTriangoli(p)).toBeCloseTo(100, 6);
  });
});

const piano = (id: string, quota: number, conAscensore: boolean): PianoPer3D => {
  const pianta: PiantaPer3D = {
    muri: [], aperture: [],
    locali: [{ id: `l-${id}`, nome: "Atrio", destinazione: "altro", contorno: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }], altezza: 270 }] as never,
    elementi: conAscensore ? [{ id: `a-${id}`, tipo: "ascensore", centro: { x: 300, y: 300 }, rotazione: 0 }] : [],
  };
  return { id, nome: id, quota, piante: { fatto: pianta, progetto: pianta } };
};

describe("solaio bucato sul vano ascensore", () => {
  it("il pavimento del piano sopra ha meno area di quello del piano sotto, e la cabina c'è solo al piano terra", () => {
    const sc = scenaEdificio([piano("t", 0, true), piano("p1", 300, true)], { vista: "fatto" });
    const areaMesh = (id: string) => {
      const m = sc.mesh.find((x) => x.id === id)!;
      let a = 0;
      for (let i = 0; i < m.indici.length; i += 3) {
        const P = [0, 1, 2].map((k) => ({ x: m.posizioni[m.indici[i + k] * 3], y: m.posizioni[m.indici[i + k] * 3 + 2] }));
        a += area(P);
      }
      return a;
    };
    expect(areaMesh("t/pavimento:l-t")).toBeCloseTo(36, 3);
    expect(areaMesh("p1/pavimento:l-p1")).toBeLessThan(36 - 2);
    expect(areaMesh("t/soffitto:l-t")).toBeLessThan(36 - 2);
    const cabine = (id: string) => sc.mesh.filter((m) => m.id.startsWith(`${id}/elemento:a-${id}:laccato`)).length;
    expect(cabine("t")).toBe(1);
    expect(cabine("p1")).toBe(0);
  });
});
