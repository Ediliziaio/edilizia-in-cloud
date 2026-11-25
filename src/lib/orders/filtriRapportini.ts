/**
 * Filtri dell'elenco dei rapportini della commessa (25/11/2026): stato, lavori o trasporti, mese, testo.
 *
 * «Trasporti» = il rapportino ha una voce di viaggio (chi vede le voci) oppure la descrizione parla di
 * trasporto, viaggio, carico/scarico: molti trasporti sono scritti solo a parole, sulle commesse dei cantieri.
 */
import type { StatoRapportino } from "@/lib/campo/rapportinoStato";

export type FiltroStato = "tutti" | StatoRapportino;
export type FiltroTipo = "tutti" | "lavori" | "trasporti";
export interface FiltriRapportini { stato: FiltroStato; tipo: FiltroTipo; mese: string; cerca: string }
export const FILTRI_VUOTI: FiltriRapportini = { stato: "tutti", tipo: "tutti", mese: "", cerca: "" };

export interface RigaFiltrabile {
  id: string;
  data_lavoro?: string | null;
  descrizione_lavori?: string | null;
  note?: string | null;
  autore?: { first_name?: string | null; last_name?: string | null } | null;
}

const PAROLE_TRASPORTO = /(^|[^\p{L}])(trasport[oi]|viaggi[oi]|carico|scarico)([^\p{L}]|$)/iu;

export function rapportinoDiTrasporto(r: RigaFiltrabile, conViaggi: ReadonlySet<string>): boolean {
  return conViaggi.has(r.id) || PAROLE_TRASPORTO.test(r.descrizione_lavori ?? "");
}

export function filtriAttivi(f: FiltriRapportini): boolean {
  return f.stato !== "tutti" || f.tipo !== "tutti" || !!f.mese || !!f.cerca.trim();
}

export function filtraRapportini<T extends RigaFiltrabile>(
  righe: readonly T[],
  f: FiltriRapportini,
  statoDi: (r: T) => StatoRapportino,
  conViaggi: ReadonlySet<string>,
): T[] {
  const parole = f.cerca.trim().toLocaleLowerCase("it").split(/\s+/).filter(Boolean);
  return righe.filter((r) => {
    if (f.stato !== "tutti" && statoDi(r) !== f.stato) return false;
    if (f.tipo !== "tutti" && rapportinoDiTrasporto(r, conViaggi) !== (f.tipo === "trasporti")) return false;
    if (f.mese && (r.data_lavoro ?? "").slice(0, 7) !== f.mese) return false;
    if (parole.length) {
      const testo = [r.descrizione_lavori, r.note, r.autore?.first_name, r.autore?.last_name].filter(Boolean).join(" ").toLocaleLowerCase("it");
      if (!parole.every((p) => testo.includes(p))) return false;
    }
    return true;
  });
}
