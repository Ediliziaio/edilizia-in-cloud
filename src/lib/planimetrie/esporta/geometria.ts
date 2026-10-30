/**
 * La geometria piana che serve a disegnare: vettori, poligoni, ritagli.
 * Tutto in centimetri, asse y verso il basso.
 */
import type { Punto } from "./tipi";

export const somma = (a: Punto, b: Punto): Punto => ({ x: a.x + b.x, y: a.y + b.y });
export const diff = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
export const per = (a: Punto, k: number): Punto => ({ x: a.x * k, y: a.y * k });
export const lunghezza = (a: Punto): number => Math.hypot(a.x, a.y);
export const distanza = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);
export const versore = (a: Punto): Punto => {
  const l = lunghezza(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** La normale a sinistra di chi cammina lungo `d` guardando lo schermo (y in basso). */
export const sinistra = (d: Punto): Punto => ({ x: d.y, y: -d.x });
export const lungo = (a: Punto, d: Punto, t: number): Punto => ({ x: a.x + d.x * t, y: a.y + d.y * t });

/** Ruota `p` di `gradi` in senso orario sullo schermo attorno all'origine. */
export function ruota(p: Punto, gradi: number): Punto {
  const r = (gradi * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function areaConSegno(poli: Punto[]): number {
  let a = 0;
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i], q = poli[(i + 1) % poli.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const areaPoligono = (poli: Punto[]): number => Math.abs(areaConSegno(poli));

export function perimetroPoligono(poli: Punto[]): number {
  let l = 0;
  for (let i = 0; i < poli.length; i++) l += distanza(poli[i], poli[(i + 1) % poli.length]);
  return l;
}

export function baricentro(poli: Punto[]): Punto {
  const a = areaConSegno(poli);
  if (Math.abs(a) < 1e-9) {
    const n = poli.length || 1;
    return { x: poli.reduce((s, p) => s + p.x, 0) / n, y: poli.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i], q = poli[(i + 1) % poli.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function dentro(p: Punto, poli: Punto[]): boolean {
  let d = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const a = poli[i], b = poli[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) d = !d;
  }
  return d;
}

export function distanzaDaSegmento(p: Punto, a: Punto, b: Punto): number {
  const ab = diff(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return distanza(p, lungo(a, ab, t));
}

export function distanzaDalBordo(p: Punto, poli: Punto[]): number {
  let m = Infinity;
  for (let i = 0; i < poli.length; i++) m = Math.min(m, distanzaDaSegmento(p, poli[i], poli[(i + 1) % poli.length]));
  return m;
}

export interface Riquadro {
  minX: number; minY: number; maxX: number; maxY: number;
}

export const riquadroVuoto = (): Riquadro => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export function allarga(r: Riquadro, p: Punto, margine = 0): Riquadro {
  r.minX = Math.min(r.minX, p.x - margine);
  r.minY = Math.min(r.minY, p.y - margine);
  r.maxX = Math.max(r.maxX, p.x + margine);
  r.maxY = Math.max(r.maxY, p.y + margine);
  return r;
}

export const riquadroDi = (punti: Punto[]): Riquadro => punti.reduce((r, p) => allarga(r, p), riquadroVuoto());

const siToccano = (a: Riquadro, b: Riquadro) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/**
 * Il punto dove scrivere il nome del locale: il più lontano dai bordi fra il
 * baricentro e una griglia di prova (in una L il baricentro cade fuori),
 * scartando i punti dove la scritta, larga `larghezza` × `altezza`, finirebbe
 * sopra un arredo o fuori dal locale.
 */
export function puntoEtichetta(
  poli: Punto[],
  o: { ostacoli?: Riquadro[]; larghezza?: number; altezza?: number } = {},
): Punto {
  const mw = (o.larghezza ?? 0) / 2, mh = (o.altezza ?? 0) / 2;
  const libero = (p: Punto) => {
    const box = { minX: p.x - mw, maxX: p.x + mw, minY: p.y - mh, maxY: p.y + mh };
    if (!(o.ostacoli ?? []).every((r) => !siToccano(box, r))) return false;
    return [
      { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
    ].every((q) => dentro(q, poli));
  };
  const c = baricentro(poli);
  const r = riquadroDi(poli);
  const passi = 24;
  const candidati: Punto[] = [c];
  for (let i = 1; i < passi; i++) {
    for (let j = 1; j < passi; j++) {
      candidati.push({ x: r.minX + ((r.maxX - r.minX) * i) / passi, y: r.minY + ((r.maxY - r.minY) * j) / passi });
    }
  }
  let migliore: Punto | null = null, dist = -1, liberoMigliore = false;
  for (const p of candidati) {
    if (!dentro(p, poli)) continue;
    const d = distanzaDalBordo(p, poli);
    const l = libero(p);
    // Un punto libero vince sempre su uno occupato; fra pari, il più lontano dai
    // bordi, e il baricentro a parità quasi piena (le scritte restano al centro).
    const meglio = migliore === null || (l && !liberoMigliore) || (l === liberoMigliore && d > dist * 1.15);
    if (meglio) {
      migliore = p;
      dist = d;
      liberoMigliore = l;
    }
  }
  return migliore ?? c;
}

/**
 * I pezzi del segmento a–b che stanno dentro il poligono. Serve per le
 * texture dei pavimenti: ogni riga si ritaglia sul contorno del locale, così
 * il disegno resta vettoriale anche nel DXF.
 */
export function ritagliaSegmento(a: Punto, b: Punto, poli: Punto[]): [Punto, Punto][] {
  const d = diff(b, a);
  const ts: number[] = [0, 1];
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i], q = poli[(i + 1) % poli.length];
    const e = diff(q, p);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = diff(p, a);
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * d.y - w.y * d.x) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const pezzi: [Punto, Punto][] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < 1e-9) continue;
    if (dentro(lungo(a, d, (t0 + t1) / 2), poli)) pezzi.push([lungo(a, d, t0), lungo(a, d, t1)]);
  }
  return pezzi;
}

/** Un'ellisse come poligono: gli archi si disegnano a segmenti in PDF e SVG. */
export function ellisse(c: Punto, rx: number, ry: number, lati = 36): Punto[] {
  return Array.from({ length: lati }, (_, i) => {
    const t = (i / lati) * Math.PI * 2;
    return { x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) };
  });
}

/** Un arco di cerchio a segmenti; gli angoli in radianti, crescenti in senso orario sullo schermo. */
export function puntiArco(c: Punto, r: number, inizio: number, fine: number, passoGradi = 5): Punto[] {
  const n = Math.max(2, Math.ceil((Math.abs(fine - inizio) * 180) / Math.PI / passoGradi));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = inizio + ((fine - inizio) * i) / n;
    return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
  });
}

/** Un rettangolo con gli angoli arrotondati, come poligono. */
export function rettangoloArrotondato(x0: number, y0: number, x1: number, y1: number, r: number): Punto[] {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  if (rr <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const q = Math.PI / 2;
  return [
    ...puntiArco({ x: x1 - rr, y: y0 + rr }, rr, -q, 0, 15),
    ...puntiArco({ x: x1 - rr, y: y1 - rr }, rr, 0, q, 15),
    ...puntiArco({ x: x0 + rr, y: y1 - rr }, rr, q, 2 * q, 15),
    ...puntiArco({ x: x0 + rr, y: y0 + rr }, rr, 2 * q, 3 * q, 15),
  ];
}

/** Numeri all'italiana: «4,20». */
export const numeroIt = (n: number, decimali = 2): string =>
  n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: true });
