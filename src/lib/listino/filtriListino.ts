/**
 * Ricerca e filtri del listino, riga per riga. Il margine è quello della
 * linea della riga, non quello base: una tipologia può avere margine giusto
 * in una linea e basso in un'altra.
 */
import type { ModalitaPrezzoBase } from "@/types/articleFamily";
import { economiaRiga, type RigaListino } from "./lineeListino";

export type FiltroMargine = "all" | "ok" | "low" | "missing";

export interface FiltriListino {
  modalita: "all" | ModalitaPrezzoBase;
  margine: FiltroMargine;
  stato: "all" | "attivi" | "disattivi";
  preventivo: "all" | "mostrati" | "nascosti";
}

export const FILTRI_LISTINO_VUOTI: FiltriListino = {
  modalita: "all",
  margine: "all",
  stato: "all",
  preventivo: "all",
};

export const MODALITA_PREZZO: Record<ModalitaPrezzoBase, string> = {
  pz: "A pezzo",
  mq: "Al metro quadro",
  griglia: "Griglia L×H",
  misura_libera: "Misura libera",
};

/** Sotto il 15% il margine è basso: la stessa soglia del listino di sempre. */
export function statoMargine(marginePct: number | null): Exclude<FiltroMargine, "all"> {
  if (marginePct == null) return "missing";
  return marginePct >= 15 ? "ok" : "low";
}

export function filtriAttivi(filtri: FiltriListino): number {
  return Object.values(filtri).filter((v) => v !== "all").length;
}

export function rigaPassa(riga: RigaListino, cerca: string, filtri: FiltriListino): boolean {
  const f = riga.famiglia;
  const testo = cerca.trim().toLowerCase();
  if (testo) {
    const dove = [f.nome, f.codice, f.descrizione, riga.linea?.label].filter(Boolean).join(" ").toLowerCase();
    if (!dove.includes(testo)) return false;
  }
  if (filtri.modalita !== "all" && f.modalita_prezzo_base !== filtri.modalita) return false;
  if (filtri.stato === "attivi" && !f.attivo) return false;
  if (filtri.stato === "disattivi" && f.attivo) return false;
  const neiPreventivi = f.mostra_preventivo !== false;
  if (filtri.preventivo === "mostrati" && !neiPreventivi) return false;
  if (filtri.preventivo === "nascosti" && neiPreventivi) return false;
  if (filtri.margine !== "all" && statoMargine(economiaRiga(riga).marginePct) !== filtri.margine) return false;
  return true;
}
