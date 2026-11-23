/**
 * Tesserino di cantiere verificabile (23/11/2026). Il QR porta a /tesserino#<codice>: il codice sta dopo «#», così
 * non finisce nei log dei server né nell'header Referer. La risposta viene da `verifica_tesserino` (database).
 */
export const PERCORSO_VERIFICA_TESSERINO = "/tesserino";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const codiceTesserinoValido = (codice: string) => UUID.test(codice);

export function indirizzoVerificaTesserino(origine: string, codice: string): string {
  return `${origine.replace(/\/$/, "")}${PERCORSO_VERIFICA_TESSERINO}#${codice}`;
}

export type EsitoTesserino = "valido" | "da_verificare" | "non_valido";
export type VoceControllo = "formazione" | "idoneita" | "personali";
export type StatoControllo = "ok" | "scaduto" | "mancante";

export interface VerificaTesserino {
  esito: EsitoTesserino;
  nome: string | null;
  cognome: string | null;
  foto: string | null;
  azienda: string | null;
  partita_iva: string | null;
  mansione: string | null;
  assunto_il: string | null;
  controlli: { voce: VoceControllo; stato: StatoControllo; scadenza: string | null }[];
  verificato_il: string;
}

export const TITOLO_ESITO: Record<EsitoTesserino, string> = {
  valido: "In regola",
  da_verificare: "Da verificare",
  non_valido: "Tesserino non valido",
};

export const SPIEGAZIONE_ESITO: Record<EsitoTesserino, string> = {
  valido: "Lavoratore in forza, con formazione sulla sicurezza e idoneità sanitaria in corso di validità.",
  da_verificare: "Lavoratore in forza, ma manca o è scaduto qualcosa: chiedi all'impresa prima di farlo lavorare.",
  non_valido: "Questa persona non risulta in forza presso l'impresa. Non farla entrare e avvisa l'impresa.",
};

export const NOME_CONTROLLO: Record<VoceControllo, string> = {
  formazione: "Formazione sulla sicurezza",
  idoneita: "Idoneità sanitaria (visita medica)",
  personali: "Documenti personali",
};

/** La riga di un controllo: «valida fino al 12/03/2027», «scaduta il …», «non registrata». */
export function testoControllo(c: VerificaTesserino["controlli"][number]): string {
  const data = c.scadenza ? new Date(`${c.scadenza}T12:00:00`).toLocaleDateString("it-IT") : null;
  if (c.voce === "personali") {
    return c.stato === "scaduto" ? "Un documento è scaduto" : c.stato === "ok" ? "In corso di validità" : "Non registrati";
  }
  if (c.stato === "ok") return data ? `Valida fino al ${data}` : "Valida";
  if (c.stato === "scaduto") return data ? `Scaduta il ${data}` : "Scaduta";
  return "Non registrata dall'impresa";
}
