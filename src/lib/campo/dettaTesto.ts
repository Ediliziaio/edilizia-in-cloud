/**
 * «Detta e ripulisci» lato app: le regole che non dipendono da React.
 *
 * Il testo dettato si AGGIUNGE in fondo a quello già scritto, mai al posto suo:
 * chi ha già scritto mezzo rapportino non deve perderlo per una dettatura.
 * «Usa la trascrizione originale» rimette il grezzo solo se la coda del campo
 * è ancora il testo pulito appena aggiunto: se la persona l'ha già ritoccato,
 * non si tocca niente.
 */

/** Registratore del campo, «Compila parlando» e dettatura: un solo limite. */
export const CAMPO_AUDIO_MAX_SECONDI = 180;
export const CAMPO_AUDIO_MIN_SECONDI = 3;

export function accodaTesto(attuale: string, aggiunta: string): string {
  const nuovo = aggiunta.trim();
  if (!nuovo) return attuale;
  const prima = attuale.replace(/\s+$/, "");
  return prima ? `${prima}\n${nuovo}` : nuovo;
}

/** Il campo con il grezzo al posto del pulito, oppure null se il campo è cambiato dopo la dettatura. */
export function tornaAllaTrascrizione(attuale: string, aggiuntoPulito: string, trascrizione: string): string | null {
  const pulito = aggiuntoPulito.trim();
  const grezzo = trascrizione.trim();
  if (!pulito || !grezzo) return null;
  const corpo = attuale.replace(/\s+$/, "");
  if (!corpo.endsWith(pulito)) return null;
  return corpo.slice(0, corpo.length - pulito.length) + grezzo;
}

export type ErroreDetta = { messaggio: string; credito: boolean };

/** Da stato HTTP e corpo della risposta al messaggio per chi è in cantiere. */
export function messaggioErroreDetta(stato: number | null, corpo: unknown): ErroreDetta {
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as { error?: unknown; code?: unknown };
  const dalServer = typeof b.error === "string" && b.error.trim() ? b.error.trim() : null;
  if (stato === null) return { messaggio: "Senza rete non posso trascrivere. Scrivi il testo: lo puoi dettare quando torna la connessione.", credito: false };
  if (stato === 402) {
    return b.code === "payment_method_required"
      ? { messaggio: dalServer ?? "Per dettare serve una carta di pagamento aziendale (Impostazioni → Fatturazione).", credito: true }
      : { messaggio: "I crediti AI dell’azienda sono finiti: nessun addebito. Ricarica i crediti o scrivi il testo a mano.", credito: true };
  }
  if (stato === 429) return { messaggio: dalServer ?? "Troppe dettature ravvicinate. Attendi qualche istante.", credito: false };
  if (stato === 401) return { messaggio: "Sessione scaduta: rientra nell’app e riprova.", credito: false };
  if (dalServer && stato < 500) return { messaggio: dalServer, credito: false };
  return { messaggio: "Trascrizione non riuscita. Riprova tra poco o scrivi il testo.", credito: false };
}
