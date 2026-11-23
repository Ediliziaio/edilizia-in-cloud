import { triangola, v2 } from "./geometria2d";
import type { Mesh3D, V3 } from "./tipi";

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

  quadLiscio(punti: [V3, V3, V3, V3], normali: [V3, V3, V3, V3]): void {
    const base = this.posizioni.length / 3;
    punti.forEach((p, i) => {
      this.posizioni.push(...p);
      this.normali.push(...normali[i]);
    });
    const media: V3 = [0, 0, 0];
    for (const n of normali) { media[0] += n[0]; media[1] += n[1]; media[2] += n[2]; }
    if (dot(normaleNewell(punti), media) >= 0) this.indici.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indici.push(base, base + 2, base + 1, base, base + 3, base + 2);
    this.facce++;
  }

  /** Tubo circolare lungo una spezzata. I raccordi seguono la tangente media. */
  tubo(percorso: V3[], raggio: number, passi = 12): void {
    if (percorso.length < 2 || raggio <= 0) return;
    const unit = (v: V3): V3 => {
      const n = len(v) || 1;
      return [v[0] / n, v[1] / n, v[2] / n];
    };
    const direzioni = percorso.map((_, i) => unit(sub(percorso[Math.min(percorso.length - 1, i + 1)], percorso[Math.max(0, i - 1)])));
    const assi: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const inclinazione = (asse: V3) => Math.max(...direzioni.map(d => Math.abs(dot(asse, d))));
    const riferimento = assi.reduce((migliore, asse) => inclinazione(asse) < inclinazione(migliore) ? asse : migliore);
    const anelli = percorso.map((p, i) => {
      const d = direzioni[i];
      const asse = Math.abs(dot(riferimento, d)) < .98 ? riferimento : assi.find(a => Math.abs(dot(a, d)) < .98)!;
      const u = unit(cross(d, asse));
      const v = cross(d, u);
      return Array.from({ length: passi }, (_, j) => {
        const a = j * Math.PI * 2 / passi;
        const n = u.map((c, k) => c * Math.cos(a) + v[k] * Math.sin(a)) as V3;
        return { n, p: p.map((c, k) => c + n[k] * raggio) as V3 };
      });
    });
    for (let i = 1; i < anelli.length; i++) for (let j = 0; j < passi; j++) {
      const k = (j + 1) % passi;
      const faccia = [anelli[i - 1][j], anelli[i - 1][k], anelli[i][k], anelli[i][j]] as const;
      this.quadLiscio([faccia[0].p, faccia[1].p, faccia[2].p, faccia[3].p], [faccia[0].n, faccia[1].n, faccia[2].n, faccia[3].n]);
    }
    this.poligono(anelli[0].map(a => a.p), direzioni[0].map(n => -n) as V3);
    this.poligono(anelli[anelli.length - 1].map(a => a.p), direzioni[direzioni.length - 1]);
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
  /** `girata`: rotazione della scatola attorno al suo centro (dx, dz), prima di quella dell'elemento. */
  scatola(cx: number, cz: number, base: number, larghezza: number, profondita: number, altezza: number, rotazione: number, dx = 0, dz = 0, girata = 0, raggio = 0): void {
    const c = Math.cos(rotazione + girata);
    const s = Math.sin(rotazione + girata);
    const ce = Math.cos(rotazione), se = Math.sin(rotazione);
    // centro della scatola nel mondo, poi i suoi assi girati
    const ox = cx + dx * ce - dz * se, oz = cz + dx * se + dz * ce;
    const mondo = (lx: number, lz: number, y: number): V3 => [ox + lx * c - lz * s, y, oz + lx * s + lz * c];
    const hx = larghezza / 2;
    const hz = profondita / 2;
    const hy = altezza / 2;
    const bordo = Math.min(raggio, hx * .95, hy * .95, hz * .95);
    if (bordo > .001) {
      const semilati = [hx, hy, hz];
      const quote = semilati.map((h) => [-h, -h + bordo / 2, -h + bordo, h - bordo, h - bordo / 2, h]);
      for (const [fisso, u, v] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
        for (const segno of [-1, 1]) {
          const da = this.posizioni.length / 3;
          for (const a of quote[u]) for (const b of quote[v]) {
            const p: V3 = [0, 0, 0];
            p[fisso] = segno * semilati[fisso];
            p[u] = a;
            p[v] = b;
            const centro = p.map((k, asse) => Math.max(bordo - semilati[asse], Math.min(semilati[asse] - bordo, k))) as V3;
            const n = sub(p, centro);
            const lunghezza = len(n);
            const [nx, ny, nz] = n.map(k => k / lunghezza);
            this.posizioni.push(...mondo(centro[0] + bordo * nx, centro[2] + bordo * nz, base + hy + centro[1] + bordo * ny));
            this.normali.push(nx * c - nz * s, ny, nx * s + nz * c);
          }
          const lato = quote[v].length;
          for (let i = 0; i < quote[u].length - 1; i++) for (let j = 0; j < lato - 1; j++) {
            const a = da + i * lato + j, b = a + lato;
            if (segno > 0) this.indici.push(a, b, b + 1, a, b + 1, a + 1);
            else this.indici.push(a, b + 1, b, a, a + 1, b + 1);
            this.facce++;
          }
        }
      }
      return;
    }
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

  /** Sfera a facce piatte (poche, per cespugli e chiome): `passi` fasce di latitudine, il doppio di longitudine. */
  sfera(cx: number, cy: number, cz: number, raggio: number, passi = 3): void {
    const lat = Math.max(2, passi), lon = lat * 2;
    const punto = (i: number, j: number): V3 => {
      const th = (Math.PI * i) / lat, ph = (2 * Math.PI * j) / lon;
      return [cx + raggio * Math.sin(th) * Math.cos(ph), cy + raggio * Math.cos(th), cz + raggio * Math.sin(th) * Math.sin(ph)];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = punto(i, j), b = punto(i, j + 1), c = punto(i + 1, j + 1), d = punto(i + 1, j);
        const m: V3 = [(a[0] + b[0] + c[0] + d[0]) / 4 - cx, (a[1] + b[1] + c[1] + d[1]) / 4 - cy, (a[2] + b[2] + c[2] + d[2]) / 4 - cz];
        this.poligono(i === 0 ? [a, c, d] : i === lat - 1 ? [a, b, c] : [a, b, c, d], m);
      }
    }
  }

  vuoto(): boolean {
    return this.indici.length === 0;
  }

  mesh(dati: Pick<Mesh3D, "id" | "nome" | "genere" | "materiale" | "riferimento" | "stratoEsploso">): Mesh3D {
    return { ...dati, posizioni: this.posizioni, normali: this.normali, indici: this.indici, facce: this.facce };
  }
}
