// Geometria piana minima per la generazione: aree, distanze, intersezioni.
// Solo funzioni pure, condivise fra la edge function, i test e il banco di prova.

import type { Punto } from "../../../shared/planimetrie/modello.ts";

export function areaFirmata(poligono: Punto[]): number {
  let a = 0;
  for (let i = 0; i < poligono.length; i++) {
    const p = poligono[i];
    const q = poligono[(i + 1) % poligono.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function area(poligono: Punto[]): number {
  return Math.abs(areaFirmata(poligono));
}

export function perimetro(poligono: Punto[]): number {
  let l = 0;
  for (let i = 0; i < poligono.length; i++) l += distanza(poligono[i], poligono[(i + 1) % poligono.length]);
  return l;
}

export function distanza(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function baricentro(poligono: Punto[]): Punto {
  const a = areaFirmata(poligono);
  if (Math.abs(a) < 1e-9) {
    const n = poligono.length || 1;
    return { x: poligono.reduce((s, p) => s + p.x, 0) / n, y: poligono.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poligono.length; i++) {
    const p = poligono[i];
    const q = poligono[(i + 1) % poligono.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Proiezione di p sul segmento ab: parametro t (0..1 dentro) e distanza. */
export function proiezione(p: Punto, a: Punto, b: Punto): { t: number; distanza: number; lunghezza: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const lunghezza = Math.sqrt(l2);
  if (l2 === 0) return { t: 0, distanza: distanza(p, a), lunghezza: 0 };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  const tc = Math.max(0, Math.min(1, t));
  return { t, distanza: distanza(p, { x: a.x + tc * dx, y: a.y + tc * dy }), lunghezza };
}

function orientamento(a: Punto, b: Punto, c: Punto): number {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : 2;
}

/** Intersezione propria fra due segmenti (estremi condivisi esclusi). */
export function segmentiSiIncrociano(p1: Punto, q1: Punto, p2: Punto, q2: Punto): boolean {
  const o1 = orientamento(p1, q1, p2);
  const o2 = orientamento(p1, q1, q2);
  const o3 = orientamento(p2, q2, p1);
  const o4 = orientamento(p2, q2, q1);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

export function autointersecante(poligono: Punto[]): boolean {
  const n = poligono.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentiSiIncrociano(poligono[i], poligono[(i + 1) % n], poligono[j], poligono[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function puntoDentro(p: Punto, poligono: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export function riquadro(poligono: Punto[]): { min: Punto; max: Punto } {
  const xs = poligono.map((p) => p.x);
  const ys = poligono.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** Area (approssimata a campionamento) dell'intersezione fra due poligoni. */
export function areaSovrapposta(a: Punto[], b: Punto[], passi = 24): number {
  const ra = riquadro(a);
  const rb = riquadro(b);
  const min = { x: Math.max(ra.min.x, rb.min.x), y: Math.max(ra.min.y, rb.min.y) };
  const max = { x: Math.min(ra.max.x, rb.max.x), y: Math.min(ra.max.y, rb.max.y) };
  if (max.x <= min.x || max.y <= min.y) return 0;
  const dx = (max.x - min.x) / passi;
  const dy = (max.y - min.y) / passi;
  let dentro = 0;
  for (let i = 0; i < passi; i++) {
    for (let j = 0; j < passi; j++) {
      const p = { x: min.x + (i + 0.5) * dx, y: min.y + (j + 0.5) * dy };
      if (puntoDentro(p, a) && puntoDentro(p, b)) dentro++;
    }
  }
  return dentro * dx * dy;
}

export function mediana(valori: number[]): number {
  if (!valori.length) return NaN;
  const s = [...valori].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
