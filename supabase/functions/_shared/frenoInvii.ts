// Freno agli invii delle automazioni: un tetto di messaggi al minuto per azienda e per canale.
//
// Perché (08/10/2026): alle 11:00 il promemoria di una sequenza è scattato per ~950 contatti insieme e il motore ha
// mandato circa 30 WhatsApp al minuto per mezz'ora; il database (Medium, CPU condivisa) si è bloccato alle 11:47.
// Con il freno un flusso, nostro o di un cliente, non può più mandare una raffica: oltre il tetto il passo aspetta
// il minuto dopo (senza contare come rinvio e senza consumare tentativi).
//
// Dependency-free: lo importano anche i test.

export type CanaleFreno = "whatsapp" | "email" | "sms";

/** Messaggi al minuto per azienda. Abbastanza per i flussi normali, troppo pochi per soffocare il database. */
export const LIMITE_AL_MINUTO: Record<CanaleFreno, number> = {
  whatsapp: 8,
  email: 20,
  sms: 8,
};

/** Il canale di un'azione del motore (già normalizzata o con l'id italiano), o null se non è un invio. */
export function canaleDelFreno(azione: string | null | undefined): CanaleFreno | null {
  switch (String(azione ?? "")) {
    case "send_whatsapp":
    case "invia_whatsapp":
    case "send_whatsapp_locale":
    case "invia_whatsapp_locale":
      return "whatsapp";
    case "send_email":
    case "invia_email":
      return "email";
    case "send_sms":
    case "invia_sms":
      return "sms";
    default:
      return null;
  }
}

/**
 * Quando riprovare un passo frenato: dopo il minuto in corso, più un margine a caso fino a 60 secondi, così i passi in
 * attesa non ripartono tutti nello stesso istante.
 */
export function riprovaDopoFreno(adessoMs: number, casuale: number = Math.random()): Date {
  const margine = Math.floor(Math.max(0, Math.min(1, casuale)) * 60_000);
  return new Date(adessoMs + 60_000 + margine);
}
