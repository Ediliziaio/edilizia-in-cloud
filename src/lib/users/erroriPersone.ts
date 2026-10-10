/**
 * Gli errori delle funzioni che gestiscono le persone, in italiano.
 *
 * Le funzioni del server rispondono con una frase in inglese
 * («Permission denied: Only admins can reset passwords») e la pagina la
 * mostrava così com'era, in un avviso rosso. Qui le frasi che il server può
 * dire, tradotte; quelle che non conosciamo passano da userErrorMessage (rete,
 * permessi, server) o dal ripiego, mai in inglese.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */
import { userErrorMessage } from "@/lib/userErrorMessage";

/** Le frasi che le funzioni del server dicono, e come si leggono. Il confronto è sull'inizio, senza maiuscole. */
const FRASI_DEL_SERVER: Array<[inizio: string, italiano: string]> = [
  ["permission denied: only admins can reset passwords", "Solo un amministratore può cambiare la password di un'altra persona."],
  ["permission denied: cannot reset another admin's password", "La password di un altro amministratore non si cambia da qui."],
  ["permission denied: cannot reset password for users in other companies", "Questa persona è di un'altra azienda: la sua password non si cambia da qui."],
  ["permission denied: cannot reset the password of a multi-company administrator", "È un amministratore con accesso a più aziende: la sua password la cambia solo la piattaforma."],
  ["cannot reset super admin password", "La password di un super admin non si cambia da qui."],
  ["target user has no role", "Questa persona non ha un ruolo: assegnaglielo prima."],
  ["user not found", "Persona non trovata."],
  ["only company admins can create staff users", "Solo un amministratore può creare nuovi utenti."],
  ["only company admins", "Questa azione la fa solo un amministratore."],
  // manage-permission-template (modelli di permessi)
  ["template not found", "Questo modello non esiste più: ricarica la pagina."],
  ["user not in your company", "Questa persona non è di questa azienda."],
  ["cannot edit this template", "I modelli di sistema non si possono modificare."],
  ["cannot delete this template", "I modelli di sistema non si possono eliminare."],
  ["no company found", "Non trovo l'azienda: ricarica la pagina e riprova."],
  ["failed to update password", "Non sono riuscito a cambiare la password. Riprova tra un attimo."],
  ["unauthorized", "Sessione scaduta. Accedi di nuovo per continuare."],
  ["non autorizzato", "Sessione scaduta. Accedi di nuovo per continuare."],
  ["missing authorization header", "Sessione scaduta. Accedi di nuovo per continuare."],
  ["edge function returned a non-2xx status code", "L'operazione non è riuscita. Riprova tra un attimo."],
];

/**
 * Il testo da mostrare per un errore di una funzione che riguarda le persone.
 * `grezzo` è il messaggio che ha detto il server (o `error.message`);
 * `ripiego` è la frase italiana da usare se non lo riconosciamo.
 */
export function messaggioErrorePersone(grezzo: unknown, ripiego: string): string {
  const testo = typeof grezzo === "string" ? grezzo : (grezzo as { message?: unknown } | null)?.message;
  if (typeof testo === "string" && testo.trim()) {
    const minuscolo = testo.trim().toLowerCase();
    const nota = FRASI_DEL_SERVER.find(([inizio]) => minuscolo.startsWith(inizio));
    if (nota) return nota[1];
    // Una frase già in italiano (le funzioni nuove rispondono così) passa com'è:
    // non ha lettere tipiche dell'inglese di un errore tecnico.
    if (/[àèéìòù]|\b(non|il|la|lo|di|per|può|solo|persona|utente|azienda)\b/i.test(testo) && !/\b(error|failed|denied|cannot|unauthorized|exception|violates)\b/i.test(testo)) {
      return testo.trim();
    }
  }
  return userErrorMessage(grezzo, ripiego);
}
