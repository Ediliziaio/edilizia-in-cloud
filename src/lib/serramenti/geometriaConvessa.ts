/**
 * Un po' di geometria per le figure convesse (arco, trapezio): ritagliare un poligono con una
 * striscia o una fascia, e trovare dove una retta lo attraversa. Serve a tagliare le ante e le
 * lamelle di una persiana sagomata dentro il suo contorno.
 */
import { insetConvesso } from "./disegnoSerramento";

export type Pt = [number, number];

/** L'area con segno: positiva se i vertici vanno in senso orario sullo schermo (y verso il basso). */
function areaConSegno(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Il poligono con i vertici in senso orario sullo schermo (come lo vuole `insetConvesso`). */
export function inSensoOrario(p: Pt[]): Pt[] {
  return areaConSegno(p) >= 0 ? p : [...p].reverse();
}

export function area(p: Pt[]): number {
  return Math.abs(areaConSegno(p));
}

/** Ritaglia un poligono convesso tenendo la parte che soddisfa `dentro`, con il punto in cui un lato attraversa il confine. */
function ritaglia(p: Pt[], dentro: (q: Pt) => boolean, interseca: (a: Pt, b: Pt) => Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const da = dentro(a);
    const db = dentro(b);
    if (da) out.push(a);
    if (da !== db) out.push(interseca(a, b));
  }
  return out;
}

const incrociaX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const incrociaY = (a: Pt, b: Pt, y: number): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

/** La parte del poligono fra due verticali x0 e x1. */
export function fasciaVerticale(p: Pt[], x0: number, x1: number): Pt[] {
  const sinistra = ritaglia(p, (q) => q[0] >= x0, (a, b) => incrociaX(a, b, x0));
  return ritaglia(sinistra, (q) => q[0] <= x1, (a, b) => incrociaX(a, b, x1));
}

/** La parte del poligono fra due orizzontali y0 e y1. */
export function fasciaOrizzontale(p: Pt[], y0: number, y1: number): Pt[] {
  const sopra = ritaglia(p, (q) => q[1] >= y0, (a, b) => incrociaY(a, b, y0));
  return ritaglia(sopra, (q) => q[1] <= y1, (a, b) => incrociaY(a, b, y1));
}

/** Dove la verticale x attraversa il poligono: [y più alto, y più basso], o null se non lo tocca. */
export function estremiVerticali(p: Pt[], x: number): [number, number] | null {
  const ys: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    if ((a[0] <= x && b[0] >= x) || (b[0] <= x && a[0] >= x)) {
      ys.push(a[0] === b[0] ? a[1] : incrociaX(a, b, x)[1]);
      if (a[0] === b[0]) ys.push(b[1]);
    }
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

export function estremi(p: Pt[]): { x0: number; x1: number; y0: number; y1: number } {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Spinge un poligono convesso verso l'interno, qualunque sia il verso dei vertici. */
export function dentro(p: Pt[], d: number): Pt[] {
  return insetConvesso(inSensoOrario(p), d);
}
