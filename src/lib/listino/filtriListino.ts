/**
 * Ricerca e filtri del listino, riga per riga. Il margine è quello della
 * linea della riga, non quello base: una tipologia può avere margine giusto
 * in una linea e basso in un'altra.
 */
import type { FamilyWithAxes, ModalitaPrezzoBase } from "@/types/articleFamily";
import { haDisegno } from "@/lib/serramenti/disegnoDaFamiglia";
import { economiaRiga, type RigaListino } from "./lineeListino";

export type FiltroMargine = "all" | "ok" | "low" | "missing";
export type FiltroFoto = "all" | "senza" | "con";

export interface FiltriListino {
  modalita: "all" | ModalitaPrezzoBase;
  margine: FiltroMargine;
  stato: "all" | "attivi" | "disattivi";
  preventivo: "all" | "mostrati" | "nascosti";
  foto: FiltroFoto;
}

export const FILTRI_LISTINO_VUOTI: FiltriListino = {
  modalita: "all",
  margine: "all",
  stato: "all",
  preventivo: "all",
  foto: "all",
};

/** Il lavoro quotidiano parte dagli attivi; «Tutti» e «Solo disattivati» restano nei filtri. */
export const FILTRI_LISTINO_INIZIALI: FiltriListino = { ...FILTRI_LISTINO_VUOTI, stato: "attivi" };

export const MODALITA_PREZZO: Record<ModalitaPrezzoBase, string> = {
  pz: "A pezzo",
  mq: "Al metro quadro",
  griglia: "Griglia L×H",
  misura_libera: "Misura libera",
};

/**
 * Sotto il 15% il margine è basso nel Listino: una soglia FISSA di questa pagina, non quella di «Prezzo e margini»
 * (che ha il suo «Margine minimo»). Le soglie sono tre (Listino, editor del prodotto, Manodopera e servizi) e oggi
 * coincidono solo perché nessuno le ha cambiate: decisione D4 di Florin, ancora aperta.
 */
export const SOGLIA_MARGINE_LISTINO = 15;

export function statoMargine(marginePct: number | null): Exclude<FiltroMargine, "all"> {
  if (marginePct == null) return "missing";
  return marginePct >= SOGLIA_MARGINE_LISTINO ? "ok" : "low";
}

/** Il prodotto ha una foto da mostrare? Una foto caricata, oppure un disegno che si fa da solo (serramenti). */
export function haFoto(famiglia: FamilyWithAxes): boolean {
  return Boolean(famiglia.immagine_url) || haDisegno(famiglia);
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
  if (filtri.foto === "con" && !haFoto(f)) return false;
  if (filtri.foto === "senza" && haFoto(f)) return false;
  return true;
}
