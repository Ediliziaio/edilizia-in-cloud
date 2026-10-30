import { triangola, v2 } from "./geometria2d";
import type { GenereMesh, Mesh3D, V3 } from "./tipi";

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** Normale di un poligono piano col metodo di Newell (robusta anche con vertici allineati). */
function normaleNewell(punti: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < punti.length; i++) {
    const p = punti[i];
    const q = punti[(i + 1) % punti.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return n;
}

/**
 * Accumula facce piane in una mesh a facce piatte (ogni faccia ha i suoi vertici,
 * così gli spigoli restano netti). Ogni faccia riceve la normale VOLUTA: l'ordine
 * dei vertici viene girato se serve, in modo che il lato visibile (antiorario, come
 * vogliono glTF e three.js) sia quello verso cui punta la normale.
 */
export class CostruttoreMesh {
  posizioni: number[] = [];
  normali: number[] = [];
  indici: number[] = [];
  facce = 0;

  /** Poligono piano convesso (rettangoli, trapezi, tagli dei muri). */
  poligono(punti: V3[], normale: V3): void {
    if (punti.length < 3) return;
    const nPoligono = normaleNewell(punti);
    const area = len(nPoligono) / 2;
    if (area < 1e-8) return;
    const ordinati = dot(nPoligono, normale) >= 0 ? punti : [...punti].reverse();
    const base = this.posizioni.length / 3;
    const nn = len(normale) > 0 ? normale.map((c) => c / len(normale)) : nPoligono.map((c) => c / (2 * area));
    for (const p of ordinati) {
      this.posizioni.push(p[0], p[1], p[2]);
      this.normali.push(nn[0], nn[1], nn[2]);
    }
    for (let i = 1; i + 1 < ordinati.length; i++) this.indici.push(base, base + i, base + i + 1);
    this.facce++;
  }

  quad(a: V3, b: V3, c: V3, d: V3, normale: V3): void {
    this.poligono([a, b, c, d], normale);
  }

  /** Poligono orizzontale anche concavo (pavimenti, soffitti), alla quota `y`. */
  orizzontale(contorno: { x: number; y: number }[], quota: number, versoAlto: boolean): void {
    if (contorno.length < 3) return;
    const tri = triangola(contorno.map((p) => v2(p.x, p.y)));
    if (tri.length === 0) return;
    const normale: V3 = [0, versoAlto ? 1 : -1, 0];
    const base = this.posizioni.length / 3;
    for (const p of contorno) {
      this.posizioni.push(p.x, quota, p.y);
      this.normali.push(normale[0], normale[1], normale[2]);
    }
    for (const [i, j, k] of tri) {
      const a: V3 = [contorno[i].x, quota, contorno[i].y];
      const b: V3 = [contorno[j].x, quota, contorno[j].y];
      const c: V3 = [contorno[k].x, quota, contorno[k].y];
      const n = cross(sub(b, a), sub(c, a));
      if (dot(n, normale) >= 0) this.indici.push(base + i, base + j, base + k);
      else this.indici.push(base + i, base + k, base + j);
    }
    this.facce++;
  }

  /**
   * Parallelepipedo: centro della base (x, z), quota della base, misure lungo i suoi assi,
   * rotazione attorno all'asse verticale (radianti, l'asse x locale va verso (cos, sin) in pianta).
   */
  scatola(cx: number, cz: number, base: number, larghezza: number, profondita: number, altezza: number, rotazione: number, dx = 0, dz = 0): void {
    const c = Math.cos(rotazione);
    const s = Math.sin(rotazione);
    const mondo = (lx: number, lz: number, y: number): V3 => [cx + (lx + dx) * c - (lz + dz) * s, y, cz + (lx + dx) * s + (lz + dz) * c];
    const hx = larghezza / 2;
    const hz = profondita / 2;
    const y0 = base;
    const y1 = base + altezza;
    const ex: V3 = [c, 0, s];
    const ez: V3 = [-s, 0, c];
    const p = (sx: number, sz: number, y: number) => mondo(sx * hx, sz * hz, y);
    this.quad(p(-1, -1, y1), p(1, -1, y1), p(1, 1, y1), p(-1, 1, y1), [0, 1, 0]);
    this.quad(p(-1, -1, y0), p(1, -1, y0), p(1, 1, y0), p(-1, 1, y0), [0, -1, 0]);
    this.quad(p(1, -1, y0), p(1, 1, y0), p(1, 1, y1), p(1, -1, y1), ex);
    this.quad(p(-1, -1, y0), p(-1, 1, y0), p(-1, 1, y1), p(-1, -1, y1), [-ex[0], 0, -ex[2]]);
    this.quad(p(-1, 1, y0), p(1, 1, y0), p(1, 1, y1), p(-1, 1, y1), ez);
    this.quad(p(-1, -1, y0), p(1, -1, y0), p(1, -1, y1), p(-1, -1, y1), [-ez[0], 0, -ez[2]]);
  }

  vuoto(): boolean {
    return this.indici.length === 0;
  }

  mesh(dati: { id: string; nome: string; genere: GenereMesh; materiale: string; riferimento: string }): Mesh3D {
    return { ...dati, posizioni: this.posizioni, normali: this.normali, indici: this.indici, facce: this.facce };
  }
}
