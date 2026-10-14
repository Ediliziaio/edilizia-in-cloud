import { rapportinoConsegnato, type StatoRapportino } from "./rapportinoStato";

/**
 * Il prossimo passo della giornata: rapportino e timbrature, senza check-in sicurezza.
 * la timbratura resta un passo consigliato e non blocca il rapportino (capita spesso di scordarla).
 * Un rapportino respinto o in bozza non è consegnato: il passo è correggerlo, non rifarne uno vocale da zero
 * (il vocale rifiuta se esiste già un rapportino di quel giorno).
 */
export type PassoGiornata =
  | "rapportino-vocale"
  | "correggi-rapportino"
  | "completa-rapportino"
  | "timbra-entrata"
  | "timbra-uscita"
  | "torna-ai-lavori";

export function prossimoPassoGiornata(i: {
  /** Legacy callers may pass this; it no longer gates the workday. */
  checklistFatta?: boolean;
  statoRapportino: StatoRapportino | null;
  isOperaio: boolean;
  hasTimbrato: boolean;
  uscitaRegistrata: boolean;
  compilaGiornaliero?: boolean;
}): PassoGiornata {
  if (i.statoRapportino === "rifiutato") return "correggi-rapportino";
  if (i.statoRapportino === "bozza") return "completa-rapportino";
  if (i.compilaGiornaliero !== false && !rapportinoConsegnato(i.statoRapportino)) return "rapportino-vocale";
  if (i.isOperaio && !i.hasTimbrato) return "timbra-entrata";
  if (i.isOperaio && !i.uscitaRegistrata) return "timbra-uscita";
  return "torna-ai-lavori";
}
