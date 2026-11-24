/**
 * «Stanza dai muri» (24/11/2026): un clic dentro le pareti e la stanza si chiude lungo il loro filo
 * interno, come il riempimento di un programma CAD. Prima una stanza si faceva solo trascinando un
 * rettangolo o cliccando ogni angolo: per la cantina di Callimaco, dieci locali, un pomeriggio.
 *
 * Le pareti si disegnano su una griglia di 5 cm e lo spazio libero si riempie a partire dal clic.
 * Se esce dal disegno, le pareti hanno un varco (porta senza muro, tratto mancante nel DWG): si
 * chiudono i varchi via via più larghi, fino a 1,40 m, e si riprova. Il contorno segue la griglia
 * (squadrato, al centimetro di 5) ed è semplificato ai soli angoli.
 */
import type { Punto } from "../../../../shared/planimetrie/modello.ts";

export interface MuroPerRiempimento { p1: Punto; p2: Punto; spessore: number }
export type EsitoStanzaDaMuri =
  | { punti: Punto[]; areaMq: number; varcoChiusoCm: number }
  | { errore: string };

const MASSIMO_CELLE = 3_000_000;

/**
 * `linee`: i tratti del disegno originale (layer DWG), usati solo se le pareti da sole lasciano
 * la stanza aperta: nella cantina di Callimaco il convertitore aveva ricavato pochi muri, ma il
 * contorno dei locali c'era tutto nelle linee della tavola.
 */
export function stanzaDaMuri(muri: MuroPerRiempimento[], punto: Punto, linee: Array<[Punto, Punto]> = [], stanze: Punto[][] = []): EsitoStanzaDaMuri {
  if (!muri.length && !linee.length) return { errore: "Non ci sono pareti: disegna prima i muri, o usa «Stanza libera»." };
  // Le stanze già disegnate sono pieno anche loro: la nuova le tocca ma non le invade (prima l'editor
  // ritagliava le vecchie e restavano a 0 m², piano terra di Callimaco, 24/11/2026).
  const soloMuri = muri.length ? riempiDaPareti(muri, punto, [0, 40, 80], stanze) : null;
  if (soloMuri && !("errore" in soloMuri && soloMuri.errore === APERTA)) return soloMuri;
  if (!linee.length) return muri.length ? riempiDaPareti(muri, punto, [110, 140], stanze) : { errore: APERTA };
  // Le linee della tavola diventano pareti sottili (4 cm), ma solo dentro l'ingombro delle pareti
  // (più 1 m): la tavola contiene anche le altre piante, il lotto, i cartigli, e senza questo limite
  // lo spazio fuori dall'edificio si chiudeva contro linee lontane (Callimaco: una «stanza» di
  // 117.744 m², 24/11/2026).
  const xs = muri.flatMap((m) => [m.p1.x, m.p2.x]), ys = muri.flatMap((m) => [m.p1.y, m.p2.y]);
  const dentro = muri.length
    ? (p: Punto) => p.x >= Math.min(...xs) - 100 && p.x <= Math.max(...xs) + 100 && p.y >= Math.min(...ys) - 100 && p.y <= Math.max(...ys) + 100
    : () => true;
  const vicine = linee.filter(([a, b]) => dentro(a) && dentro(b));
  return riempiDaPareti([...muri, ...vicine.map(([a, b]) => ({ p1: a, p2: b, spessore: 4 }))], punto, [0, 40, 80, 110, 140], stanze);
}

const APERTA = "Le pareti intorno non chiudono una stanza (c'è un varco più largo di 1,40 m): completa i muri o usa «Stanza libera».";

/** I tratti di un tracciato SVG (M, L, H, V, Z e curve ridotte alla corda), assoluti o relativi. */
export function segmentiDaTracciato(d: string): Array<[Punto, Punto]> {
  const out: Array<[Punto, Punto]> = [];
  const pezzi = d.match(/[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let k = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(pezzi[k++]);
  while (k < pezzi.length) {
    if (/[A-Za-z]/.test(pezzi[k])) cmd = pezzi[k++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") { if (x !== sx || y !== sy) out.push([{ x, y }, { x: sx, y: sy }]); x = sx; y = sy; continue; }
    let nx = x, ny = y;
    if (C === "M" || C === "L") { nx = num(); ny = num(); if (rel) { nx += x; ny += y; } }
    else if (C === "H") { nx = num() + (rel ? x : 0); }
    else if (C === "V") { ny = num() + (rel ? y : 0); }
    else if (C === "Q") { num(); num(); nx = num(); ny = num(); if (rel) { nx += x; ny += y; } }
    else if (C === "C") { num(); num(); num(); num(); nx = num(); ny = num(); if (rel) { nx += x; ny += y; } }
    else { k++; continue; }
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
    if (C === "M") { sx = nx; sy = ny; cmd = rel ? "l" : "L"; }
    else out.push([{ x, y }, { x: nx, y: ny }]);
    x = nx; y = ny;
  }
  return out;
}

function riempiDaPareti(muri: MuroPerRiempimento[], punto: Punto, varchi: number[], stanze: Punto[][] = []): EsitoStanzaDaMuri {
  const xs = muri.flatMap((m) => [m.p1.x, m.p2.x]), ys = muri.flatMap((m) => [m.p1.y, m.p2.y]);
  const margine = 60;
  const x0 = Math.min(...xs) - margine, y0 = Math.min(...ys) - margine;
  const x1 = Math.max(...xs) + margine, y1 = Math.max(...ys) + margine;
  if (punto.x <= x0 || punto.x >= x1 || punto.y <= y0 || punto.y >= y1) return { errore: "Clicca dentro una stanza, fra le pareti." };
  let passo = 5;
  while (((x1 - x0) / passo) * ((y1 - y0) / passo) > MASSIMO_CELLE) passo *= 2;
  const W = Math.ceil((x1 - x0) / passo), H = Math.ceil((y1 - y0) / passo);
  const pareti = new Uint8Array(W * H);
  for (const m of muri) {
    const meta = Math.max(m.spessore / 2, passo / 2);
    const ax = m.p1.x, ay = m.p1.y, dx = m.p2.x - ax, dy = m.p2.y - ay, l2 = dx * dx + dy * dy;
    const i0 = Math.max(0, Math.floor((Math.min(m.p1.x, m.p2.x) - meta - x0) / passo));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(m.p1.x, m.p2.x) + meta - x0) / passo));
    const j0 = Math.max(0, Math.floor((Math.min(m.p1.y, m.p2.y) - meta - y0) / passo));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(m.p1.y, m.p2.y) + meta - y0) / passo));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * passo, py = y0 + (j + 0.5) * passo;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      if (qx * qx + qy * qy <= meta * meta) pareti[j * W + i] = 1;
    }
  }
  for (const contorno of stanze) {
    if (contorno.length < 3) continue;
    const sx = contorno.map((p) => p.x), sy = contorno.map((p) => p.y);
    const i0 = Math.max(0, Math.floor((Math.min(...sx) - x0) / passo)), i1 = Math.min(W - 1, Math.ceil((Math.max(...sx) - x0) / passo));
    const j0 = Math.max(0, Math.floor((Math.min(...sy) - y0) / passo)), j1 = Math.min(H - 1, Math.ceil((Math.max(...sy) - y0) / passo));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (dentroPoligono(x0 + (i + 0.5) * passo, y0 + (j + 0.5) * passo, contorno)) pareti[j * W + i] = 1;
    }
  }
  let ci = Math.floor((punto.x - x0) / passo), cj = Math.floor((punto.y - y0) / passo);
  if (pareti[cj * W + ci]) {
    // Su una linea sottile (un tratto della tavola) si parte dal punto libero più vicino, entro 10 cm.
    const r = Math.ceil(10 / passo); // una linea della tavola sì, un muro vero no
    let migliore: [number, number] | null = null;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i <= 0 || j <= 0 || i >= W - 1 || j >= H - 1 || pareti[j * W + i]) continue;
      if (!migliore || di * di + dj * dj < (migliore[0] - ci) ** 2 + (migliore[1] - cj) ** 2) migliore = [i, j];
    }
    if (!migliore) return { errore: "Hai cliccato su una parete: clicca dentro la stanza." };
    [ci, cj] = migliore;
  }
  for (const varco of varchi) {
    const r = Math.round(varco / 2 / passo);
    const chiuse = r ? chiusura(pareti, W, H, r) : pareti;
    if (chiuse[cj * W + ci]) continue;
    const regione = riempi(chiuse, W, H, ci, cj);
    if (!regione) continue; // esce dal disegno: c'è un varco più largo
    const celle = regione.reduce((n, v) => n + v, 0);
    const areaMq = celle * passo * passo / 10_000;
    if (areaMq < 0.6) return { errore: "Lo spazio è troppo piccolo per una stanza." };
    // Più di metà dell'ingombro delle pareti non è una stanza: è il fuori.
    if (celle > 0.5 * W * H) return { errore: "Qui sei fuori dall'edificio, o le pareti non chiudono la stanza." };
    const punti = contorno(regione, W, H).map(([i, j]) => ({ x: Math.round(x0 + i * passo), y: Math.round(y0 + j * passo) }));
    if (punti.length < 3) break;
    return { punti, areaMq: Math.round(areaMq * 100) / 100, varcoChiusoCm: varco };
  }
  return { errore: APERTA };
}

function dentroPoligono(x: number, y: number, p: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i].y > y) !== (p[j].y > y) && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) dentro = !dentro;
  }
  return dentro;
}

/** Dilatazione e poi erosione con un quadrato di lato 2r+1: chiude i varchi fino a 2r celle. */
function chiusura(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const dil = scorri(scorri(m, W, H, r, true, 1), W, H, r, false, 1);
  return scorri(scorri(dil, W, H, r, true, 0), W, H, r, false, 0);
}

/** Massimo (valore 1) o minimo (valore 0) su una finestra di 2r+1 celle, per righe o per colonne. */
function scorri(m: Uint8Array, W: number, H: number, r: number, righe: boolean, valore: 0 | 1): Uint8Array {
  const out = new Uint8Array(W * H);
  const L = righe ? W : H, N = righe ? H : W;
  for (let n = 0; n < N; n++) {
    const indice = (k: number) => (righe ? n * W + k : k * W + n);
    // conta delle celle che valgono `valore` nella finestra
    let conta = 0;
    for (let k = 0; k <= Math.min(r, L - 1); k++) if (m[indice(k)] === valore) conta++;
    for (let k = 0; k < L; k++) {
      const v = valore === 1 ? (conta > 0 ? 1 : 0) : (conta > 0 ? 0 : 1);
      out[indice(k)] = v;
      const esce = k - r, entra = k + r + 1;
      if (esce >= 0 && m[indice(esce)] === valore) conta--;
      if (entra < L && m[indice(entra)] === valore) conta++;
    }
  }
  // Fuori dal disegno conta come aperto: l'erosione non deve chiudere i bordi.
  return out;
}

/** Riempimento a 4 vicini; null se tocca il bordo della griglia (la stanza non è chiusa). */
function riempi(m: Uint8Array, W: number, H: number, i: number, j: number): Uint8Array | null {
  const regione = new Uint8Array(W * H);
  const coda = new Int32Array(W * H);
  let testa = 0, fondo = 0;
  coda[fondo++] = j * W + i;
  regione[j * W + i] = 1;
  while (testa < fondo) {
    const c = coda[testa++];
    const x = c % W, y = (c - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return null;
    for (const v of [c - 1, c + 1, c - W, c + W]) {
      if (!m[v] && !regione[v]) { regione[v] = 1; coda[fondo++] = v; }
    }
  }
  return regione;
}

/** Il contorno esterno della regione, lungo i lati delle celle, ridotto ai soli angoli. */
function contorno(regione: Uint8Array, W: number, H: number): Array<[number, number]> {
  const dentro = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && regione[j * W + i] === 1;
  // Lati orientati (regione a sinistra), da vertice a vertice della griglia.
  const succ = new Map<number, number[]>();
  const chiave = (i: number, j: number) => j * (W + 1) + i;
  const aggiungi = (a: [number, number], b: [number, number]) => {
    const k = chiave(...a);
    const l = succ.get(k);
    if (l) l.push(chiave(...b)); else succ.set(k, [chiave(...b)]);
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!dentro(i, j)) continue;
    if (!dentro(i, j - 1)) aggiungi([i, j], [i + 1, j]);
    if (!dentro(i + 1, j)) aggiungi([i + 1, j], [i + 1, j + 1]);
    if (!dentro(i, j + 1)) aggiungi([i + 1, j + 1], [i, j + 1]);
    if (!dentro(i - 1, j)) aggiungi([i, j + 1], [i, j]);
  }
  const anelli: number[][] = [];
  while (succ.size) {
    const [inizio] = succ.keys();
    const anello = [inizio];
    let k = inizio;
    for (;;) {
      const l = succ.get(k);
      if (!l?.length) break;
      const n = l.pop()!;
      if (!l.length) succ.delete(k);
      if (n === inizio) break;
      anello.push(n);
      k = n;
    }
    anelli.push(anello);
  }
  const esterno = anelli.reduce((a, b) => (b.length > a.length ? b : a), []);
  const punti = esterno.map((k): [number, number] => [k % (W + 1), Math.floor(k / (W + 1))]);
  // Solo gli angoli: un punto in mezzo a due lati allineati non serve.
  return punti.filter((p, n) => {
    const a = punti[(n - 1 + punti.length) % punti.length], b = punti[(n + 1) % punti.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}
