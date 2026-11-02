import { describe, expect, it } from "vitest";
import { instradaTubo } from "@/lib/planimetrie/tred/instradamento";
import type { MuroPer3D } from "@/lib/planimetrie/tred/tipi";

const muro = (id: string, ax: number, ay: number, bx: number, by: number): MuroPer3D => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, spessore: 20, altezza: 270, stato: "esistente" } as MuroPer3D);
const buchi = (p: Array<{ x: number; y: number }>, muri: MuroPer3D[]) => {
  let n = 0;
  for (let i = 0; i < p.length - 1; i++) for (const m of muri) {
    const dx = p[i + 1].x - p[i].x, dy = p[i + 1].y - p[i].y, ex = m.b.x - m.a.x, ey = m.b.y - m.a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((m.a.x - p[i].x) * ey - (m.a.y - p[i].y) * ex) / den, u = ((m.a.x - p[i].x) * dy - (m.a.y - p[i].y) * dx) / den;
    if (t > 0.02 && t < 0.98 && u >= 0 && u <= 1) n++;
  }
  return n;
};

describe("instradaTubo", () => {
  it("senza muri sceglie una L", () => {
    const p = instradaTubo({ x: 0, y: 0 }, { x: 300, y: 200 }, []);
    expect(p).toHaveLength(3);
  });
  it("tra due punti allineati va dritto", () => {
    expect(instradaTubo({ x: 0, y: 0 }, { x: 300, y: 0 }, [])).toHaveLength(2);
  });
  it("sceglie la L che buca meno muri", () => {
    // muro orizzontale a y=100 da x=-50 a x=150: la L «x poi y» (y=0 → x=300 → y=200) lo buca, quella «y poi x» (x=0 → y=200 → x=300) pure; muro corto a x=300 lo evita solo se si parte per y
    const muri = [muro("a", 200, -50, 200, 120)];
    const p = instradaTubo({ x: 0, y: 0 }, { x: 300, y: 200 }, muri);
    const L1 = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }];
    expect(buchi(p, muri)).toBeLessThanOrEqual(buchi(L1, muri));
    expect(buchi(p, muri)).toBe(0);
  });
  it("tutti i segmenti sono ortogonali", () => {
    const p = instradaTubo({ x: 10, y: 20 }, { x: 400, y: 310 }, [muro("m", 200, 0, 200, 400)]);
    for (let i = 0; i < p.length - 1; i++) expect(p[i].x === p[i + 1].x || p[i].y === p[i + 1].y).toBe(true);
  });
});
