/**
 * Silvio che dice di aver fatto una cosa che non ha fatto.
 *
 * Il 25/09/2026, a un «analizza questo contratto e crea un'attività per il
 * DURC», Silvio ha risposto «✅ Attività DURC creata — Scadenza 30/09, Priorità
 * alta» senza chiamare nessuno strumento: nel registro degli strumenti
 * (tool_execution_log) quel turno non ha nulla e l'attività non esiste. Per chi
 * lavora dal telefono è il peggio che possa capitare: si fida, e il promemoria
 * non c'è.
 *
 * Qui si riconosce la risposta che DICHIARA un'azione di scrittura quando nel
 * turno non è andato a buon fine nessuno strumento che scrive. silvio-chat, in
 * quel caso, rimanda il modello a chiamare lo strumento o a correggersi.
 */

/** Nomi degli strumenti che scrivono (creano, inviano, registrano, …). */
const PREFISSI_SCRITTURA = [
  "crea", "create", "genera", "invia", "send", "aggiorna", "update", "registra", "register",
  "salva", "save", "approva", "importa", "assegna", "segna", "chiudi", "completa",
  "elimina", "delete", "sposta", "programma", "pianifica", "modifica", "collega",
  "sollecita", "annulla", "prenota", "conferma", "imposta", "aggiungi", "archivia", "blocca",
  "proponi", "esegui",
];

export function eStrumentoCheScrive(nome: string): boolean {
  const n = nome.toLowerCase();
  return PREFISSI_SCRITTURA.some((p) => n === p || n.startsWith(`${p}_`));
}

// «✅ Attività creata», «✅ Sollecito inviato», «ho creato», «ho registrato»…
const PARTICIPI = "(?:creat|inviat|registrat|salvat|aggiornat|programmat|pianificat|assegnat|aggiunt|impostat|segnat|chius|completat|spostat|eliminat|annullat|prenotat|confermat|collegat)[aoie]?";
const SPUNTA_AZIONE = new RegExp(`✅[^\\n]{0,80}\\b${PARTICIPI}\\b`, "i");
const PRIMA_PERSONA = /\b(?:ho|abbiamo)\s+(?:gi[aà]\s+)?(?:creato|inviato|registrato|salvato|aggiornato|programmato|pianificato|assegnato|aggiunto|impostato|segnato|chiuso|completato|spostato|eliminato|annullato|prenotato|confermato|collegato)\b/i;

export function dichiaraAzione(testo: string): boolean {
  return SPUNTA_AZIONE.test(testo) || PRIMA_PERSONA.test(testo);
}

export interface ChiamataStrumento {
  name: string;
  /** Anteprima del risultato: se contiene un errore, lo strumento non ha scritto. */
  result_preview?: string | null;
}

/**
 * Vero se il testo dichiara un'azione e nel turno nessuno strumento che scrive
 * è andato a buon fine.
 */
export function dichiaraAzioneNonEseguita(testo: string, chiamate: ChiamataStrumento[]): boolean {
  if (!testo || !dichiaraAzione(testo)) return false;
  const scritturaRiuscita = chiamate.some(
    (c) => eStrumentoCheScrive(c.name) && !/"error"\s*:/.test(c.result_preview ?? ""),
  );
  return !scritturaRiuscita;
}

/** Il richiamo che silvio-chat aggiunge alla conversazione, una volta sola per turno. */
export const RICHIAMO_AZIONE_NON_ESEGUITA =
  "Controllo automatico: nella risposta qui sopra dici di aver eseguito un'azione " +
  "(creato, inviato, registrato…), ma in questo turno non hai chiamato nessuno strumento " +
  "che la esegua, quindi NON è avvenuta. Se l'utente l'ha chiesta e hai i dati, chiama ora " +
  "lo strumento giusto. Altrimenti riscrivi la risposta dicendo chiaramente cosa NON hai " +
  "fatto e cosa ti serve per farlo. Non dichiarare mai come fatta un'azione non eseguita.";
