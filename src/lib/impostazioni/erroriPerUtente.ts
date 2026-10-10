/**
 * Cosa dire a chi ha provato a salvare e non ci è riuscito.
 *
 * Nelle pagine delle impostazioni gli errori arrivano da tre posti: un testo che abbiamo scritto noi in italiano
 * («il tuo utente non può modificare…»), un rifiuto del database che ha già la sua frase italiana (la partita
 * IVA sbagliata: codice 23514, la scrive la funzione `valida_dati_fiscali`) e tutto il resto, che è tecnico e va
 * tradotto. Prima ognuno scriveva «Impossibile salvare» e buttava via il motivo.
 */
import { userErrorMessage } from "@/lib/userErrorMessage";

/** Un errore il cui testo è già pronto per chi legge: si mostra così com'è. */
export class MessaggioPerUtente extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = "MessaggioPerUtente";
  }
}

export function motivoDelRifiuto(errore: unknown, fallback: string): string {
  if (errore instanceof MessaggioPerUtente) return errore.message;
  const e = errore as { code?: unknown; message?: unknown } | null;
  // Il database scrive in italiano i rifiuti di sua competenza (partita IVA, codice fiscale): 23514.
  if (e && e.code === "23514" && typeof e.message === "string" && e.message.trim()) return e.message;
  return userErrorMessage(errore, fallback);
}

/** L'aggiornamento non dà errore quando le regole di accesso gli lasciano toccare zero righe: va detto. */
export function righeToccate(dati: unknown): number {
  return Array.isArray(dati) ? dati.length : dati ? 1 : 0;
}
