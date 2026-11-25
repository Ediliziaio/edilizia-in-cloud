/**
 * Nuova costruzione (24/11/2026): la pianta non descrive cosa cambia in una casa che c'è,
 * ma un edificio da fare da zero. Le scelte che la pianta non dice (fondazioni, struttura,
 * solai, cappotto, riscaldamento) stanno qui, con valori di partenza dichiarati: il computo
 * le usa per ricavare scavi, fondazioni, strutture, solai, copertura, isolamenti, impianti ed
 * esterni dalla geometria dei piani.
 *
 * La geometria di un piano (superficie lorda, perimetro, pareti di perimetro) si ricava da
 * pareti e stanze su una griglia: vedi `geometriaPiano`.
 */
import { lunghezzaMuro } from "./geometria.ts";
import type { Muro, Punto } from "./modello.ts";

export type Fondazione = "travi_rovesce" | "platea" | "plinti";
export type Struttura = "telaio_ca" | "muratura_portante" | "legno_xlam";
export type Solaio = "laterocemento" | "predalles" | "legno";
export type Riscaldamento = "radiante_pompa_di_calore" | "radiatori_caldaia";
/**
 * Cosa si fa su ogni piano: `nuovo` si costruisce da zero; `esistente_da_rifare` tiene la struttura
 * e l'involucro (un prefabbricato da sopraelevare, per esempio) e rifà dentro tramezzi, impianti e
 * finiture; `esistente` resta com'è. Senza indicazione un piano è `nuovo`.
 */
export type ModoPiano = "nuovo" | "esistente_da_rifare" | "esistente";
export const NOMI_MODO_PIANO: Record<ModoPiano, string> = {
  nuovo: "Da costruire", esistente_da_rifare: "Esistente, da rifare dentro", esistente: "Esistente, non si tocca",
};

export interface Costruzione {
  tipo: "nuova_costruzione";
  fondazione: Fondazione;
  struttura: Struttura;
  solaio: Solaio;
  riscaldamento: Riscaldamento;
  /** Profondità dello scavo sotto il pavimento del piano più basso, in cm. */
  scavoCm: number;
  /** Spessore del cappotto, in cm; 0 = intonaco esterno senza cappotto. */
  cappottoCm: number;
  /** Larghezza del marciapiede intorno all'edificio, in cm; 0 = niente marciapiede. */
  marciapiedeCm: number;
  /** Per piano (id del livello): cosa si fa. Assente = tutti da costruire. */
  piani?: Record<string, ModoPiano>;
}

export const COSTRUZIONE_PREDEFINITA: Costruzione = {
  tipo: "nuova_costruzione", fondazione: "travi_rovesce", struttura: "telaio_ca", solaio: "laterocemento",
  riscaldamento: "radiante_pompa_di_calore", scavoCm: 100, cappottoCm: 12, marciapiedeCm: 100,
};

export const NOMI_FONDAZIONE: Record<Fondazione, string> = { travi_rovesce: "Travi rovesce", platea: "Platea", plinti: "Plinti collegati" };
export const NOMI_STRUTTURA: Record<Struttura, string> = { telaio_ca: "Telaio in cemento armato", muratura_portante: "Muratura portante", legno_xlam: "Legno (X-Lam)" };
export const NOMI_SOLAIO: Record<Solaio, string> = { laterocemento: "Laterocemento", predalles: "Predalles", legno: "Legno" };
export const NOMI_RISCALDAMENTO: Record<Riscaldamento, string> = {
  radiante_pompa_di_calore: "Pavimento radiante e pompa di calore", radiatori_caldaia: "Radiatori e caldaia a condensazione",
};

export const modoPiano = (c: Pick<Costruzione, "piani"> | undefined, livelloId: string): ModoPiano => c?.piani?.[livelloId] ?? "nuovo";

const eNumeroIn = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export function costruzioneValida(v: unknown): v is Costruzione {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return c.tipo === "nuova_costruzione"
    && Object.hasOwn(NOMI_FONDAZIONE, c.fondazione as string) && Object.hasOwn(NOMI_STRUTTURA, c.struttura as string)
    && Object.hasOwn(NOMI_SOLAIO, c.solaio as string) && Object.hasOwn(NOMI_RISCALDAMENTO, c.riscaldamento as string)
    && eNumeroIn(c.scavoCm, 0, 1500) && eNumeroIn(c.cappottoCm, 0, 40) && eNumeroIn(c.marciapiedeCm, 0, 500)
    && (c.piani === undefined || (typeof c.piani === "object" && c.piani !== null && !Array.isArray(c.piani)
      && Object.entries(c.piani).every(([id, m]) => /^[A-Za-z0-9_-]{1,64}$/.test(id) && Object.hasOwn(NOMI_MODO_PIANO, m as string))));
}

export interface GeometriaPiano {
  /** Superficie lorda sugli assi delle pareti, m². */
  lordaMq: number;
  /** Perimetro esterno, m. */
  perimetroM: number;
  /** Le pareti che stanno sul perimetro. */
  muriPerimetro: Set<string>;
  /** Altezza tipica delle pareti, m. */
  altezzaM: number;
}

const CELLA = 5;
/** Varchi fino a questa larghezza nel perimetro si chiudono (pareti che non si toccano, vani). */
const CHIUSURA_CM = 40;
/** Sporgenze più sottili di questa misura (muretti, parapetti) non sono edificio. */
const APERTURA_CM = 60;

/**
 * Superficie lorda, perimetro e pareti di perimetro di un piano.
 *
 * Le pareti importate da un DWG spesso non si toccano esattamente agli incroci: invece di
 * cercare le facce chiuse si disegnano pareti e stanze su una griglia di 5 cm, si chiudono i
 * piccoli varchi (chiusura morfologica da 40 cm) e si riempie dall'esterno. Quello che resta
 * è l'impronta; i lati fra impronta ed esterno sono il perimetro.
 */
export function geometriaPiano(muri: readonly Muro[], locali: readonly { contorno: Punto[] }[] = []): GeometriaPiano {
  const attivi = muri.filter((m) => m.stato !== "da_demolire" && lunghezzaMuro(m) > 1);
  const altezze = attivi.map((m) => m.altezza).sort((x, y) => x - y);
  const altezzaM = altezze.length ? altezze[Math.floor(altezze.length / 2)] / 100 : 3;
  const vuota = { lordaMq: 0, perimetroM: 0, muriPerimetro: new Set<string>(), altezzaM };
  const punti = [...attivi.flatMap((m) => [m.p1, m.p2]), ...locali.flatMap((l) => l.contorno)];
  if (!punti.length) return vuota;
  const margine = CHIUSURA_CM + 60;
  const x0 = Math.min(...punti.map((p) => p.x)) - margine, y0 = Math.min(...punti.map((p) => p.y)) - margine;
  const W = Math.ceil((Math.max(...punti.map((p) => p.x)) + margine - x0) / CELLA);
  const H = Math.ceil((Math.max(...punti.map((p) => p.y)) + margine - y0) / CELLA);
  if (W * H > 4_000_000) return vuota;
  const pieno = new Uint8Array(W * H);
  const centro = (i: number, j: number) => ({ x: x0 + (i + 0.5) * CELLA, y: y0 + (j + 0.5) * CELLA });
  const cellePareti = new Map<string, number[]>();
  for (const m of attivi) {
    const r = m.spessore / 2 + 1;
    const i0 = Math.max(0, Math.floor((Math.min(m.p1.x, m.p2.x) - r - x0) / CELLA)), i1 = Math.min(W - 1, Math.ceil((Math.max(m.p1.x, m.p2.x) + r - x0) / CELLA));
    const j0 = Math.max(0, Math.floor((Math.min(m.p1.y, m.p2.y) - r - y0) / CELLA)), j1 = Math.min(H - 1, Math.ceil((Math.max(m.p1.y, m.p2.y) + r - y0) / CELLA));
    const celle: number[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (distanzaDalSegmento(centro(i, j), m.p1, m.p2) <= r) { pieno[j * W + i] = 1; celle.push(j * W + i); }
    }
    cellePareti.set(m.id, celle);
  }
  for (const l of locali) {
    const xs = l.contorno.map((p) => p.x), ys = l.contorno.map((p) => p.y);
    for (let j = Math.max(0, Math.floor((Math.min(...ys) - y0) / CELLA)); j <= Math.min(H - 1, Math.ceil((Math.max(...ys) - y0) / CELLA)); j++)
      for (let i = Math.max(0, Math.floor((Math.min(...xs) - x0) / CELLA)); i <= Math.min(W - 1, Math.ceil((Math.max(...xs) - x0) / CELLA)); i++)
        if (puntoDentro(centro(i, j), l.contorno)) pieno[j * W + i] = 1;
  }
  // Chiusura: dilato il pieno, riempio l'esterno, poi allargo l'esterno della stessa misura.
  const k = Math.round(CHIUSURA_CM / 2 / CELLA);
  const dilatato = dilata(pieno, W, H, k);
  const fuori = new Uint8Array(W * H);
  const coda: number[] = [0];
  fuori[0] = 1;
  while (coda.length) {
    const c = coda.pop()!, i = c % W, j = (c - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      if (!fuori[n] && !dilatato[n]) { fuori[n] = 1; coda.push(n); }
    }
  }
  const chiuso = dilata(fuori, W, H, k);
  // Apertura: muretti, parapetti e linee che sporgono dall'impronta (più sottili di 60 cm) non
  // sono edificio. Erodo l'interno e lo riallargo della stessa misura.
  const a = Math.round(APERTURA_CM / 2 / CELLA);
  const eroso = dilata(chiuso, W, H, a);
  const dentroAperto = dilata(eroso.map((v) => (v ? 0 : 1)), W, H, a);
  const esterno = dentroAperto.map((v, c) => (v && !chiuso[c] ? 0 : 1));
  let celleDentro = 0, lati = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i;
    if (esterno[c]) continue;
    celleDentro++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || esterno[nj * W + ni]) lati++;
    }
  }
  const muriPerimetro = new Set<string>();
  for (const [id, celle] of cellePareti) {
    // Di perimetro: per almeno un terzo della lunghezza la parete confina con l'esterno.
    const bordo = celle.filter((c) => !esterno[c] && (esterno[c + 1] || esterno[c - 1] || esterno[c + W] || esterno[c - W])).length;
    const m = attivi.find((x) => x.id === id)!;
    if (bordo * CELLA >= lunghezzaMuro(m) / 3) muriPerimetro.add(id);
  }
  return {
    lordaMq: Math.round(celleDentro * CELLA * CELLA / 100) / 100,
    // Il contorno a gradini di una parete obliqua è più lungo del vero: per pareti diritte è esatto.
    perimetroM: Math.round(lati * CELLA) / 100,
    muriPerimetro, altezzaM,
  };
}

function distanzaDalSegmento(p: Punto, a: Punto, b: Punto) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

function puntoDentro(p: Punto, pts: readonly Punto[]) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) dentro = !dentro;
  }
  return dentro;
}

/** Dilatazione quadrata di raggio k celle, in due passate. */
function dilata(m: Uint8Array, W: number, H: number, k: number): Uint8Array {
  if (k <= 0) return m.slice();
  const riga = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    let ultimo = -Infinity;
    for (let i = 0; i < W; i++) { if (m[j * W + i]) ultimo = i; if (i - ultimo <= k) riga[j * W + i] = 1; }
    ultimo = Infinity;
    for (let i = W - 1; i >= 0; i--) { if (m[j * W + i]) ultimo = i; if (ultimo - i <= k) riga[j * W + i] = 1; }
  }
  for (let i = 0; i < W; i++) {
    let ultimo = -Infinity;
    for (let j = 0; j < H; j++) { if (riga[j * W + i]) ultimo = j; if (j - ultimo <= k) out[j * W + i] = 1; }
    ultimo = Infinity;
    for (let j = H - 1; j >= 0; j--) { if (riga[j * W + i]) ultimo = j; if (ultimo - j <= k) out[j * W + i] = 1; }
  }
  return out;
}
