/**
 * I costi delle voci del computo dal listino aziendale (31/10/2026): una voce
 * senza costo stimato ma con un codice che il listino conosce prende il costo
 * del listino (tariffe_aziendali.prezzo_costo, senza IVA). Le voci che hanno già
 * un costo restano come sono: l'ha scritto qualcuno. È lo stesso costo che il
 * database mette nella commessa se la voce arriva senza (crea_commessa_preventivo_atomic).
 */
import type { VoceEditor } from "./editorNativo";

export interface CostoListino { codice: string; costo: number }

const vuoto = (costo: string) => !costo.trim() || Number(costo.replace(",", ".")) <= 0;

/** I codici delle voci senza costo, da cercare nel listino. */
export function codiciSenzaCosto(voci: ReadonlyArray<Pick<VoceEditor, "tariffa" | "costo" | "opzionale">>): string[] {
  return [...new Set(voci.filter((v) => !v.opzionale && vuoto(v.costo) && v.tariffa.trim()).map((v) => v.tariffa.trim()))];
}

/** Le voci con i costi trovati, e quante ne sono cambiate. */
export function applicaCostiListino<T extends Pick<VoceEditor, "tariffa" | "costo">>(voci: ReadonlyArray<T>, listino: ReadonlyArray<CostoListino>): { voci: T[]; trovate: number } {
  const perCodice = new Map(listino.filter((l) => l.costo > 0).map((l) => [l.codice.trim(), l.costo]));
  let trovate = 0;
  const nuove = voci.map((v) => {
    const costo = vuoto(v.costo) ? perCodice.get(v.tariffa.trim()) : undefined;
    if (costo == null) return v;
    trovate++;
    return { ...v, costo: String(Math.round(costo * 100) / 100).replace(".", ",") };
  });
  return { voci: nuove, trovate };
}
