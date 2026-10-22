/**
 * Conteggi da un disegno CAD già letto (leggiDxf.ts):
 *   - simboli: ogni blocco inserito, per nome, per layer e per locale. È un
 *     conteggio esatto: il blocco o c'è o non c'è;
 *   - cerchi come simboli: nei disegni nati da un PDF importato i simboli non
 *     sono blocchi ma cerchi sciolti; si raggruppano per layer e diametro;
 *   - lunghezze: la somma delle linee dei layer scelti, in metri, per locale.
 *
 * Il locale di un punto: la stanza disegnata che lo contiene (contorno chiuso
 * su un layer dei locali, con il nome scritto dentro); senza stanze disegnate,
 * il nome del locale scritto più vicino — una stima, come per i PDF.
 *
 * Regole pure: nessun accesso al database.
 */
import { eNomeLocale } from "@/lib/distinta/conteggioTesto";
import type { ContornoChiuso, DisegnoCad, TestoDisegno } from "./leggiDxf";

export const SENZA_LOCALE = "Senza locale";

/** Metri per unità di disegno secondo $INSUNITS. 0 = il disegno non lo dice. */
export function metriPerUnita(insunits: number): number | null {
  const m: Record<number, number> = {
    1: 0.0254, 2: 0.3048, 3: 1609.344, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 0.0000254, 9: 0.0000254,
    10: 0.9144, 14: 0.1, 15: 10, 16: 100,
  };
  return m[insunits] ?? null;
}

export const UNITA_DISEGNO: { valore: number; etichetta: string }[] = [
  { valore: 4, etichetta: "millimetri" },
  { valore: 5, etichetta: "centimetri" },
  { valore: 14, etichetta: "decimetri" },
  { valore: 6, etichetta: "metri" },
  { valore: 1, etichetta: "pollici" },
  { valore: 2, etichetta: "piedi" },
];

export function nomeUnita(insunits: number): string {
  return UNITA_DISEGNO.find((u) => u.valore === insunits)?.etichetta ?? (insunits === 0 ? "non indicata" : `codice ${insunits}`);
}

// ─── Locali ────────────────────────────────────────────────────────────────

export interface Stanza { nome: string; layer: string; punti: number[]; area: number; minX: number; minY: number; maxX: number; maxY: number }

export interface Locali {
  modo: "contorni" | "testo_vicino" | "nessuno";
  stanze: Stanza[];
  nomi: TestoDisegno[];
  /** Distanza massima dal nome (modo testo_vicino), in unità del disegno. */
  distanzaMax: number;
}

function areaPoligono(p: number[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(a) / 2;
}

export function dentroPoligono(x: number, y: number, p: number[]): boolean {
  let dentro = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function stanzaDa(c: ContornoChiuso, nome: string): Stanza {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < c.punti.length; i += 2) {
    minX = Math.min(minX, c.punti[i]); maxX = Math.max(maxX, c.punti[i]);
    minY = Math.min(minY, c.punti[i + 1]); maxY = Math.max(maxY, c.punti[i + 1]);
  }
  return { nome, layer: c.layer, punti: c.punti, area: areaPoligono(c.punti), minX, minY, maxX, maxY };
}

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * I locali del disegno. Con `layerLocali`: i contorni chiusi di quei layer,
 * ognuno col nome scritto dentro (se ce n'è più d'uno, il più grande). Senza:
 * i nomi dei locali scritti in pianta (eventualmente solo da `layerTesti`).
 */
export function trovaLocali(d: DisegnoCad, opzioni: { layerLocali?: string[]; layerTesti?: string[] } = {}): Locali {
  const layerTesti = opzioni.layerTesti?.length ? new Set(opzioni.layerTesti) : null;
  const nomi = d.testi.filter((t) => (!layerTesti || layerTesti.has(t.layer)) && eNomeLocale(t.s));
  const hMediana = mediana(nomi.map((t) => t.h).filter((h) => h > 0));
  const distanzaMax = 40 * Math.max(hMediana, 0) || Infinity;

  const layerLocali = opzioni.layerLocali?.length ? new Set(opzioni.layerLocali) : null;
  if (layerLocali) {
    const stanze: Stanza[] = [];
    let senzaNome = 0;
    for (const c of d.contorni) {
      if (!layerLocali.has(c.layer)) continue;
      const s = stanzaDa(c, "");
      if (!(s.area > 0)) continue;
      const dentro = nomi.filter((t) => t.x >= s.minX && t.x <= s.maxX && t.y >= s.minY && t.y <= s.maxY && dentroPoligono(t.x, t.y, s.punti));
      dentro.sort((a, b) => b.h - a.h);
      s.nome = dentro[0]?.s.trim() || `Locale senza nome ${++senzaNome}`;
      stanze.push(s);
    }
    // La più piccola per prima: un punto dentro due contorni va nella stanza, non nel piano.
    stanze.sort((a, b) => a.area - b.area);
    return { modo: "contorni", stanze, nomi, distanzaMax };
  }
  return { modo: nomi.length ? "testo_vicino" : "nessuno", stanze: [], nomi, distanzaMax };
}

export function localeDi(x: number, y: number, l: Locali): string {
  if (l.modo === "contorni") {
    for (const s of l.stanze) {
      if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY) continue;
      if (dentroPoligono(x, y, s.punti)) return s.nome;
    }
    return SENZA_LOCALE;
  }
  if (l.modo === "testo_vicino") {
    let migliore: TestoDisegno | null = null;
    let dist = Infinity;
    for (const t of l.nomi) {
      const dd = Math.hypot(t.x - x, t.y - y);
      if (dd < dist) { dist = dd; migliore = t; }
    }
    if (migliore && dist <= l.distanzaMax) return migliore.s.trim();
  }
  return SENZA_LOCALE;
}

// ─── Simboli ───────────────────────────────────────────────────────────────

export interface SimboloCad {
  /** Chiave stabile: il nome del blocco in maiuscolo, o «CERCHIO Ø… @ layer». */
  chiave: string;
  tipo: "blocco" | "cerchio";
  nome: string;
  quantita: number;
  perLayer: Record<string, number>;
  perLocale: Record<string, number>;
}

function aggiungiA(m: Record<string, number>, k: string, n: number) { m[k] = (m[k] ?? 0) + n; }

/** Diametro leggibile (4 cifre significative). */
function diametro(r: number): string {
  return String(Number((2 * r).toPrecision(4))).replace(".", ",");
}

export function chiaveCerchio(layer: string, r: number): string {
  return `CERCHIO Ø${diametro(r)} @ ${layer}`.toUpperCase();
}

export function contaSimboli(
  d: DisegnoCad,
  locali: Locali,
  opzioni: { cerchi?: boolean; layerEsclusi?: string[] } = {},
): SimboloCad[] {
  const esclusi = new Set(opzioni.layerEsclusi ?? []);
  const m = new Map<string, SimboloCad>();
  const conta = (chiave: string, tipo: SimboloCad["tipo"], nome: string, layer: string, x: number, y: number, n: number) => {
    let s = m.get(chiave);
    if (!s) { s = { chiave, tipo, nome, quantita: 0, perLayer: {}, perLocale: {} }; m.set(chiave, s); }
    s.quantita += n;
    aggiungiA(s.perLayer, layer, n);
    aggiungiA(s.perLocale, localeDi(x, y, locali), n);
  };
  for (const b of d.blocchi) {
    if (esclusi.has(b.layer)) continue;
    conta(b.nome.toUpperCase(), "blocco", b.nome, b.layer, b.x, b.y, b.n);
  }
  if (opzioni.cerchi) {
    for (const c of d.cerchi) {
      if (esclusi.has(c.layer)) continue;
      const chiave = chiaveCerchio(c.layer, c.r);
      conta(chiave, "cerchio", `Cerchio Ø${diametro(c.r)} (${c.layer})`, c.layer, c.x, c.y, 1);
    }
  }
  return [...m.values()].sort((a, b) => b.quantita - a.quantita || a.nome.localeCompare(b.nome, "it", { numeric: true }));
}

// ─── Lunghezze ─────────────────────────────────────────────────────────────

/** Lunghezza totale per layer, in unità del disegno (per scegliere i layer). */
export function lunghezzePerLayer(d: DisegnoCad): { layer: string; lunghezza: number; tratti: number }[] {
  const m = new Map<string, { lunghezza: number; tratti: number }>();
  for (const t of d.tratti) {
    const v = m.get(t.layer) ?? { lunghezza: 0, tratti: 0 };
    v.lunghezza += t.lunghezza;
    v.tratti++;
    m.set(t.layer, v);
  }
  return [...m.entries()].map(([layer, v]) => ({ layer, ...v })).sort((a, b) => b.lunghezza - a.lunghezza);
}

export interface LunghezzaMisurata {
  layer: string;
  /** Percorso disegnato, in metri. */
  disegnata: number;
  /** Con la maggiorazione (risalite, sfridi), in metri. */
  totale: number;
  perLocale: Record<string, number>;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * Lunghezza in metri delle linee di ogni layer scelto, per locale (dal punto
 * medio di ogni linea). `metri` = metri per unità del disegno (unità × scala).
 */
export function misuraLunghezze(
  d: DisegnoCad,
  layer: string[],
  locali: Locali,
  opzioni: { metri: number; maggiorazionePct?: number },
): LunghezzaMisurata[] {
  const k = opzioni.metri * (1 + Math.max(0, opzioni.maggiorazionePct ?? 0) / 100);
  const scelti = new Set(layer);
  const m = new Map<string, { disegnata: number; perLocale: Record<string, number> }>();
  for (const t of d.tratti) {
    if (!scelti.has(t.layer)) continue;
    const v = m.get(t.layer) ?? { disegnata: 0, perLocale: {} };
    v.disegnata += t.lunghezza;
    aggiungiA(v.perLocale, localeDi(t.x, t.y, locali), t.lunghezza);
    m.set(t.layer, v);
  }
  return layer.filter((l) => m.has(l)).map((l) => {
    const v = m.get(l)!;
    const perLocale: Record<string, number> = {};
    for (const [loc, u] of Object.entries(v.perLocale)) perLocale[loc] = arrotonda(u * k);
    return { layer: l, disegnata: arrotonda(v.disegnata * opzioni.metri), totale: arrotonda(v.disegnata * k), perLocale };
  });
}
