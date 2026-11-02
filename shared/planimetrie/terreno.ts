/**
 * Terreno in pendenza: dai punti quotati (elementi «quota_terreno» con la quota scritta
 * nell'etichetta, es. «+1,20») e dal rilievo del topografo (shared/planimetrie/rilievo.ts)
 * la superficie del terreno e le curve di livello.
 *
 * - Con tre punti o più la quota viene dalla triangolazione di Delaunay (piani fra tre punti
 *   vicini, come nei programmi di topografia); fuori dai punti, e con uno o due punti, dalla
 *   media pesata con l'inverso del quadrato della distanza (con un punto: terreno piano).
 * - Le curve di livello si tracciano su una griglia con i «marching squares».
 *
 * Coordinate in cm; la y è quella di chi chiama (y in su nel modello, in giù nel 3D).
 */
import type { Planimetria } from "./modello.ts";
import { indicizza, puntiDelRilievo, triangola, type Rilievo, type TinIndicizzato } from "./rilievo.ts";

export const TIPO_PUNTO_QUOTA = "quota_terreno";

export interface PuntoQuotato { x: number; y: number; quota: number }

/** «+1,20», «-0.5», «1,2 m», «quota 120 cm» → cm; null se non c'è un numero. */
export function leggiQuota(testo: string | undefined | null): number | null {
  if (!testo) return null;
  const m = testo.replace(/\s+/g, "").match(/([+\-−]?\d+(?:[.,]\d+)?)(cm|m)?/i);
  if (!m) return null;
  const v = Number(m[1].replace("−", "-").replace(",", "."));
  if (!Number.isFinite(v)) return null;
  const cm = m[2]?.toLowerCase() === "cm" ? v : v * 100;
  return Math.abs(cm) <= 100_000 ? Math.round(cm) : null;
}

/** 120 → «+1,20 m». */
export function scriviQuota(cm: number): string {
  const s = (Math.abs(cm) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cm > 0 ? "+" : cm < 0 ? "−" : "±"}${s} m`;
}

/** I punti quotati della pianta (di ogni piano, com'è oggi): il terreno è uno solo. */
export function puntiTerreno(doc: Pick<Planimetria, "livelli"> & { rilievo?: Rilievo }): PuntoQuotato[] {
  const out: PuntoQuotato[] = doc.rilievo ? puntiDelRilievo(doc.rilievo) : [];
  for (const l of doc.livelli) {
    for (const e of l.fatto.elementi) {
      if (e.tipo !== TIPO_PUNTO_QUOTA) continue;
      const q = leggiQuota(e.etichetta);
      if (q !== null) out.push({ x: e.posizione.x, y: e.posizione.y, quota: q });
    }
  }
  return out;
}

// la triangolazione si fa una volta per elenco di punti (le griglie chiedono migliaia di quote)
const TIN = new WeakMap<readonly PuntoQuotato[], TinIndicizzato>();
function tinDi(punti: readonly PuntoQuotato[]): TinIndicizzato {
  let t = TIN.get(punti);
  if (!t) { t = indicizza(triangola([...punti])); TIN.set(punti, t); }
  return t;
}

/** Quota del terreno (cm) nel punto (x, y). */
export function quotaTerreno(punti: readonly PuntoQuotato[], x: number, y: number): number {
  if (!punti.length) return 0;
  if (punti.length >= 3) {
    const q = tinDi(punti).cerca(x, y);
    if (q !== null) return q;
  }
  return mediaPesata(punti, x, y);
}

function mediaPesata(punti: readonly PuntoQuotato[], x: number, y: number): number {
  let num = 0, den = 0;
  for (const p of punti) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 < 1) return p.quota;
    const w = 1 / d2;
    num += w * p.quota;
    den += w;
  }
  return num / den;
}

/** Equidistanza delle curve (cm): 50 cm, più larga se il dislivello è grande (al massimo una quarantina di curve). */
export function passoCurve(punti: readonly PuntoQuotato[]): number {
  if (!punti.length) return 50;
  const q = punti.map((p) => p.quota);
  const dislivello = Math.max(...q) - Math.min(...q);
  return [50, 100, 200, 500, 1000, 2000, 5000].find((p) => dislivello / p <= 40) ?? 10_000;
}

export interface Rettangolo { x0: number; y0: number; x1: number; y1: number }
export interface TrattoCurva { a: { x: number; y: number }; b: { x: number; y: number }; quota: number }

/** Il rettangolo dei punti allargato di `margine` cm. */
export function rettangoloPunti(punti: readonly PuntoQuotato[], margine = 300): Rettangolo | null {
  if (!punti.length) return null;
  const xs = punti.map((p) => p.x), ys = punti.map((p) => p.y);
  return { x0: Math.min(...xs) - margine, y0: Math.min(...ys) - margine, x1: Math.max(...xs) + margine, y1: Math.max(...ys) + margine };
}

/**
 * Curve di livello ogni `passo` cm (50 = ogni mezzo metro) dentro il rettangolo, su una
 * griglia di al massimo `celle` × `celle`. Ogni tratto porta la sua quota.
 */
export function curveDiLivello(punti: readonly PuntoQuotato[], r: Rettangolo, passo = 50, celle = 60): TrattoCurva[] {
  if (punti.length < 2 || passo <= 0) return [];
  const quote = punti.map((p) => p.quota);
  const qMin = Math.min(...quote), qMax = Math.max(...quote);
  if (qMax - qMin < passo / 2) return [];
  const nx = celle, ny = Math.max(2, Math.round((celle * (r.y1 - r.y0)) / Math.max(1, r.x1 - r.x0)));
  const dx = (r.x1 - r.x0) / nx, dy = (r.y1 - r.y0) / ny;
  const z: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    z.push([]);
    for (let i = 0; i <= nx; i++) z[j].push(quotaTerreno(punti, r.x0 + i * dx, r.y0 + j * dy));
  }
  const out: TrattoCurva[] = [];
  // le quote esattamente uguali al punto più basso o più alto sarebbero un punto, non una curva
  const primo = Math.floor(qMin / passo) * passo + passo;
  for (let q = primo; q < qMax; q += passo) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // angoli della cella: 0 (i,j) 1 (i+1,j) 2 (i+1,j+1) 3 (i,j+1)
        const v = [z[j][i], z[j][i + 1], z[j + 1][i + 1], z[j + 1][i]];
        const p = [
          { x: r.x0 + i * dx, y: r.y0 + j * dy }, { x: r.x0 + (i + 1) * dx, y: r.y0 + j * dy },
          { x: r.x0 + (i + 1) * dx, y: r.y0 + (j + 1) * dy }, { x: r.x0 + i * dx, y: r.y0 + (j + 1) * dy },
        ];
        const tagli: Array<{ x: number; y: number }> = [];
        for (let k = 0; k < 4; k++) {
          const a = v[k], b = v[(k + 1) % 4];
          if ((a < q) !== (b < q)) {
            const t = (q - a) / (b - a);
            tagli.push({ x: p[k].x + (p[(k + 1) % 4].x - p[k].x) * t, y: p[k].y + (p[(k + 1) % 4].y - p[k].y) * t });
          }
        }
        if (tagli.length === 2) out.push({ a: tagli[0], b: tagli[1], quota: q });
        else if (tagli.length === 4) { out.push({ a: tagli[0], b: tagli[1], quota: q }); out.push({ a: tagli[2], b: tagli[3], quota: q }); }
      }
    }
  }
  return out;
}
