/**
 * Sottotetto e mansarda: le stanze sotto le falde hanno il soffitto inclinato, e l'altezza
 * cambia da un punto all'altro. Da qui escono, per ogni stanza, altezza minima, massima e media
 * (volume diviso superficie) e la superficie utile, quella dove si sta in piedi.
 *
 * Regole usate (le più diffuse nelle leggi regionali sul recupero dei sottotetti; i comuni
 * possono chiedere altro): locali abitabili con altezza media almeno 2,40 m (2,20 per i
 * servizi), altezza minima almeno 1,50 m; le parti sotto 1,50 m non contano nella superficie
 * utile (si possono chiudere con armadi o ripostigli).
 *
 * Funziona sul modello (cm, y verso l'alto). Il tetto si calcola come nel 3D: rettangolo dei
 * muri più lo sporto (shared/planimetrie/tetto.ts); y verso l'alto o verso il basso non cambia
 * le quote, solo il nome delle esposizioni, che qui non serve.
 */
import { baseTetto, facceTetto, quotaFalde, rettangoloTetto, type Faccia } from "./tetto.ts";
import type { Livello, Locale, StatoPianta } from "./modello.ts";

export const ALTEZZA_UTILE_MINIMA = 150;
export const ALTEZZA_MEDIA_ABITABILI = 240;
export const ALTEZZA_MEDIA_SERVIZI = 220;

export interface AltezzeSottotetto {
  /** cm */
  minima: number;
  massima: number;
  media: number;
  /** m² dove l'altezza è almeno 1,50 m. */
  superficieUtile: number;
  /** m² in tutto (sotto 1,50 compresi). */
  superficie: number;
  /** m³ */
  volume: number;
}

/** Le falde sopra le stanze del piano, se il piano è una mansarda; altrimenti null. */
export function falde(livello: Pick<Livello, "tetto">, stato: Pick<StatoPianta, "muri">): Faccia[] | null {
  const t = livello.tetto;
  if (!t?.mansarda || t.tipo === "piano") return null;
  const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
  if (!muri.length) return null;
  const r = rettangoloTetto(muri.map((m) => ({ a: m.p1, b: m.p2, spessore: m.spessore })), t.sporto);
  if (!r) return null;
  return facceTetto(r, baseTetto(t, Math.max(...muri.map((m) => m.altezza))), t);
}

function dentro(p: { x: number; y: number }, c: ReadonlyArray<{ x: number; y: number }>) {
  let s = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    if ((c[i].y > p.y) !== (c[j].y > p.y) && p.x < ((c[j].x - c[i].x) * (p.y - c[i].y)) / (c[j].y - c[i].y) + c[i].x) s = !s;
  }
  return s;
}

/**
 * Altezze di una stanza sotto le falde, a campioni di `passo` cm. In mansarda il soffitto è la
 * falda: l'altezza del locale conta solo dove il tetto non c'è sopra.
 */
export function altezzeLocale(locale: Pick<Locale, "contorno" | "altezza">, facce: readonly Faccia[], passo = 10): AltezzeSottotetto | null {
  const c = locale.contorno;
  if (c.length < 3) return null;
  const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // non più di 40.000 campioni: le stanze grandi si campionano più larghe
  const q = Math.max(passo, Math.sqrt(((x1 - x0) * (y1 - y0)) / 40_000));
  let n = 0, utili = 0, somma = 0, min = Infinity, max = -Infinity;
  for (let x = x0 + q / 2; x < x1; x += q) {
    for (let y = y0 + q / 2; y < y1; y += q) {
      if (!dentro({ x, y }, c)) continue;
      const z = quotaFalde(facce, x, y);
      const h = Math.max(0, z ?? locale.altezza);
      n++;
      somma += h;
      if (h >= ALTEZZA_UTILE_MINIMA) utili++;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  if (!n) return null;
  const cella = (q * q) / 10_000;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    minima: Math.round(min),
    massima: Math.round(max),
    media: Math.round(somma / n),
    superficieUtile: r2(utili * cella),
    superficie: r2(n * cella),
    volume: r2((somma / 100) * cella),
  };
}
