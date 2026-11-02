/**
 * Prima di spedire un messaggio: cosa manca, cosa sembra dimenticato, e la bozza
 * che sopravvive a una chiusura per sbaglio. Niente React qui.
 */

/** Il testo parla di un allegato e non ce n'è nessuno. */
export function allegatoDimenticato(testo: string, allegati: number): boolean {
  if (allegati > 0) return false;
  return /\b(allegat[oaie]|allego|alleghiamo|allegando)\b/i.test(testo);
}

/** Perché non si può ancora inviare l'email; null se si può. */
export function motivoBloccoEmail(e: { mittente: string; oggetto: string; testo: string; caricamento: boolean }): string | null {
  if (!e.mittente) return "Scegli la casella da cui inviare";
  if (!e.oggetto.trim()) return "Manca l'oggetto";
  if (!e.testo.trim()) return "Manca il testo";
  if (e.caricamento) return "Allegato in caricamento";
  return null;
}

export interface Bozza { smsText?: string; emailSubject?: string; emailBody?: string; salvata: number }

const SETTE_GIORNI = 7 * 24 * 60 * 60 * 1000;
const chiave = (utente: string, destinatario: string) => `bozza-messaggio:${utente}:${destinatario}`;

export function leggiBozza(utente: string, destinatario: string, ora = Date.now()): Bozza | null {
  try {
    const b = JSON.parse(localStorage.getItem(chiave(utente, destinatario)) ?? "null") as Bozza | null;
    if (!b || ora - b.salvata > SETTE_GIORNI) return null;
    return b.smsText?.trim() || b.emailSubject?.trim() || b.emailBody?.trim() ? b : null;
  } catch {
    return null;
  }
}

export function salvaBozza(utente: string, destinatario: string, testi: Omit<Bozza, "salvata">, ora = Date.now()) {
  try {
    if (testi.smsText?.trim() || testi.emailSubject?.trim() || testi.emailBody?.trim()) {
      localStorage.setItem(chiave(utente, destinatario), JSON.stringify({ ...testi, salvata: ora }));
    } else {
      localStorage.removeItem(chiave(utente, destinatario));
    }
  } catch { /* senza spazio o in privato: la bozza è una comodità */ }
}

export function cancellaBozza(utente: string, destinatario: string) {
  try {
    localStorage.removeItem(chiave(utente, destinatario));
  } catch { /* vedi sopra */ }
}
