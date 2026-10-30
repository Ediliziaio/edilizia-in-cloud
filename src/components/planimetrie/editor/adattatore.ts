/**
 * Adattatore tra l'editor e il modello della pianta.
 *
 * Il modello vero (tipi, controllo geometrico, quantità) è della fase 1 e vivrà in
 * `shared/planimetrie/`. Finché non c'è, l'editor lavora contro questi tipi
 * provvisori: tutto ciò che l'editor sa del modello passa da qui, così il cambio
 * verso i tipi veri tocca solo questo file.
 *
 * Unità: centimetri. Asse y verso il basso (come lo schermo).
 */

export type Origine = "rilevata" | "da_documento" | "stimata";

/** Stato rispetto al progetto: convenzione italiana giallo = demolire, rosso = nuovo. */
export type StatoElemento = "esistente" | "da_demolire" | "nuovo";

export interface Punto {
  x: number;
  y: number;
}

export interface Muro {
  id: string;
  p1: Punto;
  p2: Punto;
  spessore: number;
  altezza: number;
  tipo: "portante" | "tramezzo";
  stato: StatoElemento;
  origine: Origine;
}

export type TipoApertura = "porta" | "finestra" | "portafinestra";

export interface Apertura {
  id: string;
  muroId: string;
  tipo: TipoApertura;
  /** Distanza del centro dell'apertura da `muro.p1`, lungo l'asse del muro. */
  posizione: number;
  larghezza: number;
  altezza: number;
  davanzale: number;
  /** Da che parte sta la cerniera e verso quale lato del muro si apre. */
  verso: { cerniera: "inizio" | "fine"; lato: "sinistra" | "destra" };
  stato: StatoElemento;
  origine: Origine;
}

export interface Locale {
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Contorno sull'asse dei muri, in senso qualunque. */
  contorno: Punto[];
  altezza: number;
  stato: StatoElemento;
  origine: Origine;
}

export interface Pianta {
  versione: 1;
  unita: "cm";
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
}

export const DESTINAZIONI = [
  { valore: "soggiorno", etichetta: "Soggiorno" },
  { valore: "cucina", etichetta: "Cucina" },
  { valore: "camera", etichetta: "Camera" },
  { valore: "bagno", etichetta: "Bagno" },
  { valore: "disimpegno", etichetta: "Corridoio / disimpegno" },
  { valore: "ripostiglio", etichetta: "Ripostiglio" },
  { valore: "ingresso", etichetta: "Ingresso" },
  { valore: "studio", etichetta: "Studio" },
  { valore: "lavanderia", etichetta: "Lavanderia" },
  { valore: "balcone", etichetta: "Balcone / terrazzo" },
  { valore: "altro", etichetta: "Altro" },
] as const;

export type Destinazione = (typeof DESTINAZIONI)[number]["valore"];

export const SPESSORE_TRAMEZZO = 10;
export const SPESSORE_PORTANTE = 30;
export const ALTEZZA_PIANO = 270;

export function piantaVuota(): Pianta {
  return { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
}

// ─── Quantità provvisorie ─────────────────────────────────────────────────────
// Le quantità vere arriveranno da `shared/planimetrie/quantita`. Qui solo quel che
// serve all'editor per far vedere subito mq e perimetro di ogni stanza.

function areaConSegno(punti: Punto[]): number {
  let s = 0;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % punti.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Muro che giace sul lato a→b (stesso allineamento, lo copre almeno in parte). */
function muroSulLato(pianta: Pianta, a: Punto, b: Punto): Muro | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return undefined;
  const ux = dx / len;
  const uy = dy / len;
  let migliore: Muro | undefined;
  let sovrapposizioneMax = 0;
  for (const m of pianta.muri) {
    const d1 = Math.abs((m.p1.x - a.x) * uy - (m.p1.y - a.y) * ux);
    const d2 = Math.abs((m.p2.x - a.x) * uy - (m.p2.y - a.y) * ux);
    if (d1 > 0.5 || d2 > 0.5) continue;
    const t1 = (m.p1.x - a.x) * ux + (m.p1.y - a.y) * uy;
    const t2 = (m.p2.x - a.x) * ux + (m.p2.y - a.y) * uy;
    const sovrapposizione = Math.min(len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
    if (sovrapposizione > sovrapposizioneMax) {
      sovrapposizioneMax = sovrapposizione;
      migliore = m;
    }
  }
  return migliore;
}

/**
 * Contorno interno (il pavimento calpestabile): il contorno sull'asse spostato verso
 * l'interno di mezzo spessore del muro che sta su ciascun lato.
 */
export function contornoInterno(pianta: Pianta, locale: Locale): Punto[] {
  const p = locale.contorno;
  const n = p.length;
  if (n < 3) return p;
  const orario = areaConSegno(p) > 0; // y verso il basso: area positiva = senso orario a schermo
  // Retta di ogni lato spostata verso l'interno.
  const rette = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // normale interna
    const nx = orario ? -uy : uy;
    const ny = orario ? ux : -ux;
    const muro = muroSulLato(pianta, a, b);
    const off = muro ? muro.spessore / 2 : 0;
    return { a: { x: a.x + nx * off, y: a.y + ny * off }, u: { x: ux, y: uy } };
  });
  return rette.map((r, i) => {
    const prec = rette[(i - 1 + n) % n];
    return intersezioneRette(prec.a, prec.u, r.a, r.u) ?? r.a;
  });
}

function intersezioneRette(p: Punto, u: Punto, q: Punto, v: Punto): Punto | null {
  const den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den;
  return { x: p.x + u.x * t, y: p.y + u.y * t };
}

export interface QuantitaLocale {
  /** Superficie del pavimento, in mq. */
  mq: number;
  /** Perimetro interno, in metri. */
  perimetro: number;
  /** Lunghezza interna di ciascun lato, in cm (lato i = contorno[i] → contorno[i+1]). */
  lati: number[];
  stimata: boolean;
}

export function quantitaLocale(pianta: Pianta, locale: Locale): QuantitaLocale {
  const interno = contornoInterno(pianta, locale);
  const lati = interno.map((a, i) => {
    const b = interno[(i + 1) % interno.length];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const stimata =
    locale.origine === "stimata" ||
    locale.contorno.some((a, i) => {
      const m = muroSulLato(pianta, a, locale.contorno[(i + 1) % locale.contorno.length]);
      return m?.origine === "stimata";
    });
  return {
    mq: Math.abs(areaConSegno(interno)) / 10_000,
    perimetro: lati.reduce((s, l) => s + l, 0) / 100,
    lati,
    stimata,
  };
}

/** Il muro su cui giace il lato i del locale, se c'è (serve per correggerne la misura). */
export function muroDelLato(pianta: Pianta, locale: Locale, lato: number): Muro | undefined {
  const c = locale.contorno;
  return muroSulLato(pianta, c[lato], c[(lato + 1) % c.length]);
}
