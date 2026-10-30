/**
 * I pavimenti della pianta da presentazione: un colore di fondo e il disegno
 * delle doghe o delle fughe, ritagliato sul contorno del locale. Sono linee
 * vere, non immagini: restano nitide a ogni ingrandimento e si stampano in scala.
 */
import { riquadroDi, ritagliaSegmento } from "./geometria";
import type { LocaleVista, Pavimento, Punto } from "./tipi";

export interface Texture {
  colore: string;
  coloreLinee: string;
  spessoreMm: number;
  linee: [Punto, Punto][];
}

/** Il pavimento di chi non l'ha scelto, dalla destinazione del locale. */
export function pavimentoDiSerie(destinazione?: string): Pavimento {
  const d = (destinazione ?? "").toLowerCase();
  if (/bagno|wc|servizio/.test(d)) return "piastrelle";
  if (/camera|soggiorno|studio|salotto|letto/.test(d)) return "parquet";
  if (/balcon|terrazz|loggia|esterno/.test(d)) return "cotto";
  return "gres";
}

const STILI: Record<Pavimento, { colore: string; linee: string; passo: number; spessoreMm: number }> = {
  parquet: { colore: "#D8B48A", linee: "#B98D60", passo: 15, spessoreMm: 0.08 },
  gres: { colore: "#E6E2DB", linee: "#C8C1B6", passo: 60, spessoreMm: 0.08 },
  piastrelle: { colore: "#E2ECF0", linee: "#B9CBD3", passo: 20, spessoreMm: 0.07 },
  cotto: { colore: "#D49170", linee: "#B06D4D", passo: 30, spessoreMm: 0.08 },
  marmo: { colore: "#F0EEEA", linee: "#D5D0C8", passo: 60, spessoreMm: 0.07 },
  resina: { colore: "#D9D6D0", linee: "#D9D6D0", passo: 0, spessoreMm: 0 },
};

export function texturaPavimento(l: LocaleVista): Texture {
  const tipo = l.pavimento ?? pavimentoDiSerie(l.destinazione);
  const s = STILI[tipo];
  const poli = l.contorno;
  const linee: [Punto, Punto][] = [];
  if (s.passo <= 0 || poli.length < 3) return { colore: s.colore, coloreLinee: s.linee, spessoreMm: s.spessoreMm, linee };
  const r = riquadroDi(poli);
  const taglia = (a: Punto, b: Punto) => linee.push(...ritagliaSegmento(a, b, poli));

  if (tipo === "parquet") {
    // Doghe lungo il lato lungo del locale, giunti sfalsati di un terzo
    const orizzontale = r.maxX - r.minX >= r.maxY - r.minY;
    const lunghezzaDoga = 90;
    const [u0, u1, v0, v1] = orizzontale ? [r.minX, r.maxX, r.minY, r.maxY] : [r.minY, r.maxY, r.minX, r.maxX];
    const P = (u: number, v: number): Punto => (orizzontale ? { x: u, y: v } : { x: v, y: u });
    let fila = 0;
    for (let v = v0 + s.passo; v < v1; v += s.passo, fila++) taglia(P(u0, v), P(u1, v));
    fila = 0;
    for (let v = v0; v < v1; v += s.passo, fila++) {
      const sfalsa = ((fila * 37) % 3) * (lunghezzaDoga / 3);
      for (let u = u0 + sfalsa + lunghezzaDoga * 0.5; u < u1; u += lunghezzaDoga) {
        taglia(P(u, v), P(u, Math.min(v + s.passo, v1)));
      }
    }
  } else {
    for (let x = r.minX + s.passo; x < r.maxX; x += s.passo) taglia({ x, y: r.minY }, { x, y: r.maxY });
    for (let y = r.minY + s.passo; y < r.maxY; y += s.passo) taglia({ x: r.minX, y }, { x: r.maxX, y });
  }
  return { colore: s.colore, coloreLinee: s.linee, spessoreMm: s.spessoreMm, linee };
}
