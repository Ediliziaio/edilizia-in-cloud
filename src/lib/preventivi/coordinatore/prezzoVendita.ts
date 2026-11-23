/**
 * Dal costo al prezzo, con le due regole che in cantiere si confondono.
 *
 *   margine 30%  → prezzo = costo ÷ (1 − 0,30)   100,00 € → 142,86 €   (il 30% è del PREZZO)
 *   ricarico 30% → prezzo = costo × (1 + 0,30)   100,00 € → 130,00 €   (il 30% è del COSTO)
 *
 * I conti li fa il codice, mai un modello: stesso arrotondamento commerciale dell'editor del computo.
 */
import { arrotondaDecimale } from "@/lib/computo/editorNativo";
import type { RegolaPrezzo } from "./tipi";

/** Oltre questo margine il prezzo diverge: stesso tetto di `obiettivoMargine`. */
const MARGINE_MASSIMO_PCT = 94;

const valido = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1e9;

export function prezzoDaMargine(costo: number, marginePct: number): number | null {
  if (!valido(costo) || !Number.isFinite(marginePct) || marginePct < 0 || marginePct > MARGINE_MASSIMO_PCT) return null;
  return arrotondaDecimale(costo / (1 - marginePct / 100));
}

export function prezzoDaRicarico(costo: number, ricaricoPct: number): number | null {
  if (!valido(costo) || !Number.isFinite(ricaricoPct) || ricaricoPct < 0 || ricaricoPct > 10_000) return null;
  return arrotondaDecimale(costo * (1 + ricaricoPct / 100));
}

export function prezzoDaRegola(costo: number, regola: RegolaPrezzo): number | null {
  return regola.tipo === "margine" ? prezzoDaMargine(costo, regola.pct) : prezzoDaRicarico(costo, regola.pct);
}

/** Margine sul prezzo di vendita, in percentuale con un decimale. `null` se manca un dato o il prezzo è zero. */
export function marginePct(costo: number | null, prezzo: number | null): number | null {
  if (costo === null || prezzo === null || !valido(costo) || !valido(prezzo) || prezzo === 0) return null;
  return arrotondaDecimale(((prezzo - costo) / prezzo) * 100, 1);
}

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const pct = (n: number) => `${String(arrotondaDecimale(n, 1)).replace(".", ",")}%`;

export function testoRegola(costo: number, regola: RegolaPrezzo): string {
  return `${regola.tipo === "margine" ? "margine" : "ricarico"} ${pct(regola.pct)} sul costo ${euro.format(costo)}`;
}
