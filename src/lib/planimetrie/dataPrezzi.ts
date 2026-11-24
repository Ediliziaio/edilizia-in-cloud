/**
 * La data dei prezzi di una variante (24/11/2026). Ogni soluzione dice a che giorno sono i suoi
 * prezzi, e se il listino dell'azienda è cambiato da allora.
 *
 * - I prezzi scritti nella variante (`prezziLavorazioni`) portano il giorno in cui sono stati presi
 *   (`data`); quelli salvati prima del 24/11/2026 non lo hanno e restano «senza data».
 * - I prezzi proposti al volo (listino, prezzario, indicativo) sono quelli di oggi.
 * - Il computo generato dalla variante tiene il suo giorno in `fontePlanimetria.prezziAl`.
 *
 * «Da aggiornare» non si basa su una data di modifica del listino (la tabella non la tiene) ma sul
 * confronto: un prezzo preso da una proposta che oggi la stessa proposta darebbe diverso.
 * I prezzi scritti a mano non si segnalano mai: sono una scelta, non una fonte che invecchia.
 */
import type { Planimetria, PrezzoVocePlanimetria } from "../../../shared/planimetrie/modello.ts";
import { ePrezzoProposto, proponiPrezzo, type FontiPrezzi } from "./prezziProposti";
import type { RigaStudio } from "./studioImmobiliare";

/** Oggi, nel fuso di chi usa l'app (AAAA-MM-GG). */
export const oggiIso = (adesso = new Date()) => adesso.toLocaleDateString("en-CA");

/** «24/11/2026». */
export const dataItaliana = (iso: string) => iso.split("-").reverse().join("/");

export interface DataPrezzi {
  /** Il giorno più vecchio fra i prezzi della soluzione; null se nessun prezzo ha una data. */
  al: string | null;
  /** Prezzi salvati senza data (varianti di prima del 24/11/2026). */
  senzaData: number;
  /** Quanti prezzi in tutto. */
  prezzi: number;
}

/** A che giorno sono i prezzi di una soluzione: i salvati con la loro data, i proposti di oggi. */
export function dataPrezziVariante(doc: Planimetria, variante: string | null, righe: readonly Pick<RigaStudio, "id" | "livelloId" | "prezzo">[], oggi = oggiIso()): DataPrezzi {
  const salvati = new Map(doc.livelli.map(l => [l.id, l.proposte.find(p => p.id === variante)?.prezziLavorazioni ?? {}]));
  let al: string | null = null, senzaData = 0, prezzi = 0;
  for (const r of righe) {
    if (!r.prezzo) continue;
    prezzi++;
    const salvato = Object.hasOwn(salvati.get(r.livelloId) ?? {}, r.id);
    const data = salvato ? r.prezzo.data : oggi;
    if (!data) { senzaData++; continue; }
    if (!al || data < al) al = data;
  }
  return { al, senzaData, prezzi };
}

export interface PrezzoDaAggiornare { id: string; descrizione: string; prima: number; oggi: number; fonte: string }

/**
 * I prezzi presi da una proposta (listino, prezzario, indicativo) che oggi la stessa regola darebbe
 * diversi: il listino è cambiato dopo. `prezzo` è quello conservato (nella variante o nel computo).
 */
export function prezziDaAggiornare(righe: readonly (Pick<RigaStudio, "id" | "descrizione" | "unita"> & { prezzo?: Pick<PrezzoVocePlanimetria, "importo" | "fonte"> })[], fonti: FontiPrezzi): PrezzoDaAggiornare[] {
  return righe.flatMap(r => {
    if (!r.prezzo || !ePrezzoProposto(r.prezzo)) return [];
    const oggi = proponiPrezzo(r, fonti);
    if (!oggi || Math.abs(oggi.importo - r.prezzo.importo) < 0.005) return [];
    return [{ id: r.id, descrizione: r.descrizione, prima: r.prezzo.importo, oggi: oggi.importo, fonte: oggi.fonte }];
  });
}

/** Il testo per una soluzione: «Prezzi al 24/11/2026», con le eccezioni dette. */
export function testoDataPrezzi(d: DataPrezzi): string {
  if (!d.prezzi) return "Nessun prezzo";
  if (!d.al) return "Data dei prezzi non registrata";
  return `Prezzi al ${dataItaliana(d.al)}${d.senzaData ? ` · ${d.senzaData} senza data` : ""}`;
}
