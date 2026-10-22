/**
 * Prezzo di una voce di listino a partire dal costo.
 *
 * Tre numeri che si confondono sempre:
 *   - COSTO PIENO = costo diretto × (1 + spese generali %). Le spese generali
 *     sono quelle di «Prezzo e margini»: il prezzo deve coprirle, e il
 *     preventivo le sottrae dal ricavo (non le conta due volte).
 *   - RICARICO % = quanto si aggiunge al costo pieno:  prezzo = costo × (1 + r).
 *   - MARGINE %  = quanto resta del prezzo:            (prezzo − costo) / prezzo.
 * Un ricarico del 20% è un margine del 16,7%; un margine del 25% è un ricarico
 * del 33,3%. Chi fa i prezzi ragiona quasi sempre nel primo, le soglie
 * dell'azienda sono nel secondo: qui si passa dall'uno all'altro.
 *
 * Tutto puro: niente rete, niente database, verificabile dai test.
 */

export type ModoPrezzo = "libero" | "dal_costo";

const finito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Quattro decimali, come le tariffe: un prezzo calcolato non deve perdere centesimi. */
export function arrotondaTariffa(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e4) / 1e4;
}

/**
 * Il prezzo calcolato dal costo: al centesimo da 1 € in su, a quattro decimali
 * sotto (voci da pochi millesimi al pezzo). Il ricarico si salva a quattro
 * decimali, e un prezzo a quattro decimali calcolato da lui non tornerebbe mai
 * col prezzo calcolato al momento (1666,6667 € salvato, 1666,6670 € rifatto):
 * la voce risultava «da aggiornare» appena salvata. Al centesimo i due coincidono.
 */
export function arrotondaPrezzoDalCosto(n: number): number {
  return Math.abs(n) >= 1 ? Math.round((n + Number.EPSILON) * 100) / 100 : arrotondaTariffa(n);
}

/** Il ricarico come si salva (numeric(8,4)): quello che si usa per il prezzo è lo stesso che si rilegge. */
export function arrotondaRicarico(r: number): number {
  return Math.round((r + Number.EPSILON) * 1e4) / 1e4;
}

/** Il ricarico più alto che il database accetta (vincolo < 10000). */
export const RICARICO_MASSIMO = 9999.9999;

/** Costo diretto più le spese generali. Spese generali assenti o non valide = 0%. */
export function costoPieno(costo: number | null | undefined, speseGeneraliPct?: number | null): number | null {
  if (!finito(costo) || costo < 0) return null;
  const sg = finito(speseGeneraliPct) && speseGeneraliPct > 0 ? speseGeneraliPct : 0;
  return arrotondaTariffa(costo * (1 + sg / 100));
}

/** Prezzo = costo pieno × (1 + ricarico). null se il costo non c'è o il ricarico non è valido. */
export function prezzoDaRicarico(costoPienoVoce: number | null | undefined, ricaricoPct: number | null | undefined): number | null {
  if (!finito(costoPienoVoce) || costoPienoVoce < 0 || !finito(ricaricoPct) || ricaricoPct < 0 || ricaricoPct > RICARICO_MASSIMO) return null;
  return arrotondaPrezzoDalCosto(costoPienoVoce * (1 + arrotondaRicarico(ricaricoPct) / 100));
}

/** Margine % sul prezzo che dà un certo ricarico % sul costo. */
export function margineDaRicarico(ricaricoPct: number | null | undefined): number | null {
  if (!finito(ricaricoPct) || ricaricoPct < 0) return null;
  return (ricaricoPct / (100 + ricaricoPct)) * 100;
}

/** Ricarico % sul costo che serve per un certo margine % sul prezzo (margine sotto il 100%). */
export function ricaricoDaMargine(marginePct: number | null | undefined): number | null {
  if (!finito(marginePct) || marginePct < 0 || marginePct >= 100) return null;
  return (marginePct / (100 - marginePct)) * 100;
}

/** Il ricarico che ha di fatto un prezzo libero. null senza costo positivo. */
export function ricaricoDaPrezzo(prezzo: number | null | undefined, costoPienoVoce: number | null | undefined): number | null {
  if (!finito(prezzo) || !finito(costoPienoVoce) || costoPienoVoce <= 0) return null;
  return (prezzo / costoPienoVoce - 1) * 100;
}

/** Margine % sul prezzo. null senza prezzo positivo o senza costo. */
export function marginePrezzo(prezzo: number | null | undefined, costoPienoVoce: number | null | undefined): number | null {
  if (!finito(prezzo) || prezzo <= 0 || !finito(costoPienoVoce) || costoPienoVoce < 0) return null;
  return ((prezzo - costoPienoVoce) / prezzo) * 100;
}

/** Ricarico con al massimo due decimali, per i campi: 33,3333… si mostra 33,33. */
export function arrotondaPercento(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** «+30%» / «+33,33%»: il ricarico come si legge accanto al margine. */
export function formatRicarico(ricaricoPct: number | null | undefined): string {
  if (!finito(ricaricoPct)) return "—";
  const v = arrotondaPercento(ricaricoPct);
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}

export interface VoceDaRicalcolare {
  prezzo_modo?: string | null;
  ricarico_pct?: number | string | null;
  prezzo_vendita?: number | string | null;
}

/**
 * Il prezzo che una voce «dal costo» dovrebbe avere oggi, dato il suo costo
 * diretto e le spese generali. null se la voce non è «dal costo» o se manca
 * qualcosa per calcolarlo (in quel caso il prezzo salvato non si tocca).
 */
export function prezzoAttesoDalCosto(v: VoceDaRicalcolare, costo: number | null, speseGeneraliPct?: number | null): number | null {
  if (v.prezzo_modo !== "dal_costo") return null;
  // un costo a zero non è un costo da cui far nascere un prezzo: il prezzo andrebbe a zero
  if (costo == null || !(costo > 0)) return null;
  const r = v.ricarico_pct == null || v.ricarico_pct === "" ? null : Number(v.ricarico_pct);
  return prezzoDaRicarico(costoPieno(costo, speseGeneraliPct), r);
}

/** Una voce «dal costo» il cui prezzo salvato non torna più col costo di oggi. */
export function prezzoDaRiallineare(v: VoceDaRicalcolare, costo: number | null, speseGeneraliPct?: number | null): boolean {
  const atteso = prezzoAttesoDalCosto(v, costo, speseGeneraliPct);
  if (atteso == null) return false;
  const salvato = Number(v.prezzo_vendita ?? 0);
  return Math.abs(atteso - salvato) > 0.00005;
}
