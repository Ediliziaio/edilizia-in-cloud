/**
 * Il piano di posa dei pannelli sul tetto (25/10/2026): i moduli disegnati IN SCALA sulla vista satellitare.
 *
 * Un modulo solo per l'editor del wizard (React) e per il PDF (HTML): stessa geometria, quindi il piano che
 * l'installatore ha disegnato è quello che il cliente vede nel preventivo.
 *
 * La vista è sempre la stessa: Google Static Maps centrata sull'indirizzo, zoom 20, 640 × 400 punti (a scala 2
 * l'immagine ha il doppio dei pixel, le coordinate restano quelle). Da lì i metri per punto: ogni modulo ha le sue
 * misure vere (1,13 × 1,72 m di riferimento) e lo si vede stare, o non stare, sulla falda.
 *
 * Il piano si salva in `fv_progetti.layout_overlay`:
 *   { x, y, rot, cols, unita: "m", orient }   x e y sono METRI dal centro della vista (x a destra, y in basso),
 *                                              rot in gradi (senso orario), cols le colonne, orient "v" | "o".
 * Il vecchio editor (luglio 2026) scriveva x e y in percentuale senza `unita`: quelli non sono un piano in scala e
 * qui si ignorano.
 *
 * Modulo puro, senza import: lo usano sia il browser sia le edge function.
 */

export const PIANO_ZOOM = 20;
export const PIANO_LARGHEZZA = 640;
export const PIANO_ALTEZZA = 400;
/** Modulo di riferimento (circa 450 W): larghezza × altezza in verticale. */
export const MODULO_RIFERIMENTO = { larghezza_m: 1.134, altezza_m: 1.722 } as const;
/** Spazio fra i moduli, in metri. */
export const PIANO_SPAZIO_M = 0.02;
const SPOSTAMENTO_MAX_M = 60;

export interface PianoTetto {
  x: number;
  y: number;
  rot: number;
  cols: number;
  unita: "m";
  orient: "v" | "o";
}

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const limita = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Metri per punto della vista a quella latitudine e a quello zoom (Web Mercator). */
export function metriPerPunto(latitudine: number, zoom: number = PIANO_ZOOM): number {
  const lat = limita(Number(latitudine) || 0, -85, 85);
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Il piano com'è salvato, se è un piano in scala; i vecchi in percentuale, o ciò che non lo è, danno null. */
export function leggiPiano(raw: unknown): PianoTetto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.unita !== "m") return null;
  if (!finito(r.x) || !finito(r.y) || !finito(r.rot) || !finito(r.cols)) return null;
  return {
    x: limita(r.x, -SPOSTAMENTO_MAX_M, SPOSTAMENTO_MAX_M),
    y: limita(r.y, -SPOSTAMENTO_MAX_M, SPOSTAMENTO_MAX_M),
    rot: limita(r.rot, -180, 180),
    cols: Math.round(limita(r.cols, 1, 40)),
    unita: "m",
    orient: r.orient === "o" ? "o" : "v",
  };
}

/** Le colonne con cui partire: una disposizione larga una volta e mezza l'altezza, come un tetto a falda. */
export function colonneSuggerite(moduli: number): number {
  const n = Math.max(1, Math.round(moduli) || 1);
  return Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.5))));
}

/** Il piano di partenza: al centro della vista, dritto, in verticale. */
export function pianoIniziale(moduli: number): PianoTetto {
  return { x: 0, y: 0, rot: 0, cols: colonneSuggerite(moduli), unita: "m", orient: "v" };
}

export interface PannelloDisegnato { x: number; y: number; w: number; h: number }

export interface PianoDisegnato {
  /** Centro del gruppo nella vista, in punti. */
  cx: number;
  cy: number;
  rot: number;
  /** I moduli, con le coordinate attorno al centro del gruppo (da usare dentro `translate(cx cy) rotate(rot)`). */
  pannelli: PannelloDisegnato[];
  /** Ingombro dell'insieme, in metri. */
  larghezzaM: number;
  altezzaM: number;
  /** Area dei soli moduli, in metri quadri. */
  areaM2: number;
  righe: number;
  /** Almeno un angolo dell'insieme esce dalla vista. */
  fuori: boolean;
}

/** Dove vanno i moduli sulla vista, in scala. */
export function disponiPannelli(opts: {
  moduli: number;
  piano: PianoTetto;
  metriPerPuntoVista: number;
  larghezza?: number;
  altezza?: number;
}): PianoDisegnato {
  const larghezzaVista = opts.larghezza ?? PIANO_LARGHEZZA;
  const altezzaVista = opts.altezza ?? PIANO_ALTEZZA;
  const mpp = opts.metriPerPuntoVista > 0 ? opts.metriPerPuntoVista : 0.1;
  const n = Math.max(0, Math.round(opts.moduli) || 0);
  const cols = Math.max(1, Math.min(opts.piano.cols, n || 1));
  const righe = n > 0 ? Math.ceil(n / cols) : 0;
  const verticale = opts.piano.orient !== "o";
  const mw = (verticale ? MODULO_RIFERIMENTO.larghezza_m : MODULO_RIFERIMENTO.altezza_m) / mpp;
  const mh = (verticale ? MODULO_RIFERIMENTO.altezza_m : MODULO_RIFERIMENTO.larghezza_m) / mpp;
  const spazio = PIANO_SPAZIO_M / mpp;
  const W = cols * mw + (cols - 1) * spazio;
  const H = righe * mh + Math.max(righe - 1, 0) * spazio;
  const pannelli: PannelloDisegnato[] = [];
  for (let i = 0; i < n; i++) {
    pannelli.push({ x: -W / 2 + (i % cols) * (mw + spazio), y: -H / 2 + Math.floor(i / cols) * (mh + spazio), w: mw, h: mh });
  }
  const cx = larghezzaVista / 2 + opts.piano.x / mpp;
  const cy = altezzaVista / 2 + opts.piano.y / mpp;
  const rad = (opts.piano.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const fuori = n > 0 && ([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]] as const).some(([px, py]) => {
    const gx = cx + px * cos - py * sin;
    const gy = cy + px * sin + py * cos;
    return gx < 0 || gx > larghezzaVista || gy < 0 || gy > altezzaVista;
  });
  return {
    cx, cy, rot: opts.piano.rot, pannelli,
    larghezzaM: n > 0 ? W * mpp : 0,
    altezzaM: n > 0 ? H * mpp : 0,
    areaM2: n * MODULO_RIFERIMENTO.larghezza_m * MODULO_RIFERIMENTO.altezza_m,
    righe, fuori,
  };
}

const arrotonda = (v: number) => Math.round(v * 100) / 100;

/** Le stesse forme come SVG (per il PDF): moduli, e a richiesta la scala in metri. */
export function svgPannelli(piano: PianoDisegnato, colori: { riempimento: string; bordo: string } = { riempimento: "rgba(37,99,235,0.78)", bordo: "#E0F2FE" }): string {
  if (piano.pannelli.length === 0) return "";
  const rects = piano.pannelli
    .map((p) => `<rect x="${arrotonda(p.x)}" y="${arrotonda(p.y)}" width="${arrotonda(p.w)}" height="${arrotonda(p.h)}" rx="1" fill="${colori.riempimento}" stroke="${colori.bordo}" stroke-width="0.8"/>`)
    .join("");
  return `<g transform="translate(${arrotonda(piano.cx)} ${arrotonda(piano.cy)}) rotate(${arrotonda(piano.rot)})">${rects}</g>`;
}

/** Una lunghezza in metri come testo italiano: «12,4 m». */
export function metriTesto(m: number): string {
  return `${(Math.round(m * 10) / 10).toLocaleString("it-IT")} m`;
}
