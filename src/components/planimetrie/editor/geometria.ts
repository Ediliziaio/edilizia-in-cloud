/**
 * Geometria dell'editor: distanze, proiezioni e aggancio del cursore
 * (agli angoli esistenti, alle pareti, alle direzioni dritte, alla griglia).
 * Funzioni pure, in centimetri.
 */
import type { Muro, Pianta, Punto } from "./adattatore";

export const GRIGLIA = 5;

export const somma = (a: Punto, b: Punto): Punto => ({ x: a.x + b.x, y: a.y + b.y });
export const diff = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
export const uguali = (a: Punto, b: Punto, tol = 0.5) => dist(a, b) <= tol;
export const lunghezzaMuro = (m: Muro) => dist(m.p1, m.p2);

export function arrotonda(p: Punto, passo = GRIGLIA): Punto {
  return { x: Math.round(p.x / passo) * passo, y: Math.round(p.y / passo) * passo };
}

export function direzione(m: Pick<Muro, "p1" | "p2">): Punto {
  const l = dist(m.p1, m.p2) || 1;
  return { x: (m.p2.x - m.p1.x) / l, y: (m.p2.y - m.p1.y) / l };
}

/** Punto a distanza `t` da p1 lungo il muro. */
export function puntoSulMuro(m: Pick<Muro, "p1" | "p2">, t: number): Punto {
  const u = direzione(m);
  return { x: m.p1.x + u.x * t, y: m.p1.y + u.y * t };
}

/** Proiezione di p sull'asse del muro: `t` da p1 (limitato al muro) e distanza. */
export function proiettaSuMuro(p: Punto, m: Pick<Muro, "p1" | "p2">) {
  const l = dist(m.p1, m.p2);
  const u = direzione(m);
  const tLibero = (p.x - m.p1.x) * u.x + (p.y - m.p1.y) * u.y;
  const t = Math.max(0, Math.min(l, tLibero));
  const q = puntoSulMuro(m, t);
  return { t, tLibero, punto: q, distanza: dist(p, q) };
}

/** Il punto p sta sul segmento a–b (non agli estremi esclusi)? */
export function sulSegmento(p: Punto, a: Punto, b: Punto, tol = 0.5): boolean {
  const pr = proiettaSuMuro(p, { p1: a, p2: b });
  return pr.distanza <= tol && pr.tLibero >= -tol && pr.tLibero <= dist(a, b) + tol;
}

export function muroPiuVicino(pianta: Pianta, p: Punto, tolleranza: number, filtro?: (m: Muro) => boolean) {
  let migliore: { muro: Muro; t: number; distanza: number } | null = null;
  for (const m of pianta.muri) {
    if (filtro && !filtro(m)) continue;
    const pr = proiettaSuMuro(p, m);
    const soglia = Math.max(tolleranza, m.spessore / 2);
    if (pr.distanza <= soglia && (!migliore || pr.distanza < migliore.distanza)) {
      migliore = { muro: m, t: pr.t, distanza: pr.distanza };
    }
  }
  return migliore;
}

export function puntoInPoligono(p: Punto, poligono: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export type Guida = "angolo" | "parete" | "dritto" | "allineato" | "griglia";

export interface Aggancio {
  punto: Punto;
  guida: Guida;
  /** Punto con cui ci si è allineati (per disegnare la linea guida). */
  riferimento?: Punto;
}

/** Tutti gli angoli esistenti: estremi delle pareti e vertici delle stanze. */
export function angoliEsistenti(pianta: Pianta): Punto[] {
  const punti: Punto[] = [];
  for (const m of pianta.muri) punti.push(m.p1, m.p2);
  for (const l of pianta.locali) punti.push(...l.contorno);
  return punti;
}

/**
 * Aggancia il cursore. `tolleranza` è in cm (di solito ~12 pixel trasformati in cm
 * con lo zoom corrente). `da` è il punto di partenza di una parete in corso: con
 * quello si aggancia anche alle direzioni dritte (orizzontale/verticale).
 */
export function aggancia(
  pianta: Pianta,
  p: Punto,
  { tolleranza, da }: { tolleranza: number; da?: Punto },
): Aggancio {
  // 1. Angoli esistenti
  let vicino: Punto | null = null;
  for (const a of angoliEsistenti(pianta)) {
    if (da && uguali(a, da)) continue;
    if (dist(a, p) <= tolleranza && (!vicino || dist(a, p) < dist(vicino, p))) vicino = a;
  }
  if (vicino) return { punto: { ...vicino }, guida: "angolo" };

  // 2. Direzione dritta rispetto al punto di partenza
  let q = p;
  let guida: Guida | null = null;
  let riferimento: Punto | undefined;
  if (da) {
    const dx = p.x - da.x;
    const dy = p.y - da.y;
    const angolo = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    const vicinoA = (gradi: number) => Math.abs(angolo - gradi) < 8;
    if (vicinoA(0) || vicinoA(180)) {
      q = { x: da.x + Math.round(dx / GRIGLIA) * GRIGLIA, y: da.y };
      guida = "dritto";
    } else if (vicinoA(90)) {
      q = { x: da.x, y: da.y + Math.round(dy / GRIGLIA) * GRIGLIA };
      guida = "dritto";
    }
  }

  // 3. Su una parete esistente (solo se non stiamo già andando dritti)
  if (!guida) {
    const muro = muroPiuVicino(pianta, p, tolleranza);
    if (muro && muro.distanza <= tolleranza) {
      return { punto: arrotondaSulMuro(muro.muro, muro.t), guida: "parete" };
    }
  }

  // 4. Allineamento con un angolo esistente (stessa x o stessa y)
  for (const a of angoliEsistenti(pianta)) {
    if (guida === "dritto") {
      // muovendosi in orizzontale si può fermare sulla x di un angolo, e viceversa
      if (da && q.y === da.y && Math.abs(a.x - q.x) <= tolleranza) return { punto: { x: a.x, y: q.y }, guida: "allineato", riferimento: a };
      if (da && q.x === da.x && Math.abs(a.y - q.y) <= tolleranza) return { punto: { x: q.x, y: a.y }, guida: "allineato", riferimento: a };
    }
  }
  if (guida) return { punto: q, guida, riferimento };

  return { punto: arrotonda(p), guida: "griglia" };
}

function arrotondaSulMuro(m: Muro, t: number): Punto {
  return puntoSulMuro(m, Math.round(t / GRIGLIA) * GRIGLIA);
}
