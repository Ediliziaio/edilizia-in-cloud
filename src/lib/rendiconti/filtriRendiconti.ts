/**
 * Filtri dell'elenco dei rendiconti della commessa (28/11/2026): gli stessi dei rapportini — stato,
 * lavori o trasporti, mese, testo — perché le due schede si usino allo stesso modo.
 *
 * «Trasporti» qui non si indovina dalle parole: un rendiconto è di trasporti se ha righe di categoria
 * «trasporto» (n_trasporti, contato dalla vista).
 */
import type { RendicontoGiornaliero, StatoRendiconto } from "./rendicontiGiornalieri";

export type FiltroStatoRendiconto = "tutti" | StatoRendiconto;
export type FiltroTipoRendiconto = "tutti" | "lavori" | "trasporti";
export interface FiltriRendiconti { stato: FiltroStatoRendiconto; tipo: FiltroTipoRendiconto; mese: string; cerca: string }
export const FILTRI_RENDICONTI_VUOTI: FiltriRendiconti = { stato: "tutti", tipo: "tutti", mese: "", cerca: "" };

export const rendicontoDiTrasporti = (r: Pick<RendicontoGiornaliero, "n_trasporti">) => r.n_trasporti > 0;

export function filtriRendicontiAttivi(f: FiltriRendiconti): boolean {
  return f.stato !== "tutti" || f.tipo !== "tutti" || !!f.mese || !!f.cerca.trim();
}

export function filtraRendiconti<T extends RendicontoGiornaliero>(righe: readonly T[], f: FiltriRendiconti): T[] {
  const parole = f.cerca.trim().toLocaleLowerCase("it").split(/\s+/).filter(Boolean);
  return righe.filter((r) => {
    if (f.stato !== "tutti" && r.stato !== f.stato) return false;
    if (f.tipo !== "tutti" && rendicontoDiTrasporti(r) !== (f.tipo === "trasporti")) return false;
    if (f.mese && r.data.slice(0, 7) !== f.mese) return false;
    if (parole.length) {
      const testo = [r.descrizione_lavori, r.note, `n. ${r.numero}`].filter(Boolean).join(" ").toLocaleLowerCase("it");
      if (!parole.every((p) => testo.includes(p))) return false;
    }
    return true;
  });
}
