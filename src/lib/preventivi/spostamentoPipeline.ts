import { TRANSIZIONI_STATO } from "@/lib/serramenti/statoLabels";
import { mapSerramentiStato, type UnifiedStato } from "./statoUnificato";
import type { SrStatoProgetto } from "@/types/serramenti";
import type { PreventivoTipo, UnifiedRow } from "@/components/marketing/preventivi/UnifiedPreventiviList";

const TABELLE: Partial<Record<PreventivoTipo, string>> = {
  classico: "quotes", serramenti: "sr_progetti", fotovoltaico: "fv_progetti",
  ristrutturazione: "rst_progetti", bagni: "bgn_progetti", tetti: "tet_progetti",
  climatizzazione: "clm_progetti", elettrico: "ele_progetti", termoidraulico: "idr_progetti",
  pavimenti: "pav_progetti", piscine: "pis_progetti",
};

export interface SpostamentoPreventivo {
  tabella: string;
  colonna: "status" | "stato";
  da: string;
  a: string;
  descrizione: string;
}

/** Solo operazioni già previste dal flusso del modulo o dall'azione «segna come perso».
 * Le firme, gli invii e i contratti si gestiscono nel loro documento. */
export function pianoSpostamentoPreventivo(riga: UnifiedRow, destinazione: UnifiedStato): SpostamentoPreventivo | null {
  if (destinazione === riga.stato_unif || riga.tipo === "computo" || riga.stato_unif === "vinto") return null;
  const tabella = TABELLE[riga.tipo];
  if (!tabella) return null;
  if (riga.tipo === "serramenti") {
    const possibili = TRANSIZIONI_STATO[riga.stato_raw as SrStatoProgetto] ?? [];
    // La fase generica «In corso» non prova che il documento sia stato consegnato.
    const prossimo = riga.stato_raw === "bozza" && destinazione === "in_corso"
      ? possibili.find(t => t.next === "da_consegnare")
      : possibili.find(t => mapSerramentiStato(t.next) === destinazione);
    if (prossimo) return { tabella, colonna: "stato", da: riga.stato_raw, a: prossimo.next, descrizione: prossimo.label.replace(/^[✅❌]\s*/, "") };
  }
  if (destinazione !== "perso" || riga.stato_unif === "perso") return null;
  return {
    tabella, colonna: riga.tipo === "classico" ? "status" : "stato", da: riga.stato_raw,
    a: riga.tipo === "classico" ? "rifiutata" : riga.tipo === "fotovoltaico" ? "annullato" : "rifiutato",
    descrizione: "Segna come perso",
  };
}
