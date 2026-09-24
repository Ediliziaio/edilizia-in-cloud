// Avvisi di sicurezza delle email di accesso (24/09/2026).
//
// Supabase manda i suoi avvisi (password cambiata, email cambiata, …) dalla
// stessa strada delle email di accesso: auth-email-hook. Il hook non li
// conosceva e li trattava come un recupero password: in 30 giorni 38 persone,
// appena cambiata la password, hanno ricevuto «Hai chiesto una nuova password»
// con un pulsante che non portava da nessuna parte. Un avviso dice solo cosa è
// successo: niente link, niente codice.

export interface Avviso {
  oggetto: string;
  titolo: string;
  corpo: string;
}

const AVVISI: Record<string, Avviso> = {
  password_changed_notification: {
    oggetto: "La password del tuo account è cambiata",
    titolo: "Password cambiata",
    corpo: "La password del tuo account Edilizia in Cloud è appena stata cambiata. Se sei stato tu, non devi fare niente.",
  },
  email_changed_notification: {
    oggetto: "L'email del tuo account è cambiata",
    titolo: "Indirizzo email cambiato",
    corpo: "L'indirizzo email con cui accedi a Edilizia in Cloud è appena stato cambiato. Se sei stato tu, non devi fare niente.",
  },
  phone_changed_notification: {
    oggetto: "Il telefono del tuo account è cambiato",
    titolo: "Numero di telefono cambiato",
    corpo: "Il numero di telefono del tuo account Edilizia in Cloud è appena stato cambiato. Se sei stato tu, non devi fare niente.",
  },
  identity_linked_notification: {
    oggetto: "Un nuovo modo di accedere al tuo account",
    titolo: "Nuovo accesso collegato",
    corpo: "Al tuo account Edilizia in Cloud è stato collegato un nuovo modo di accedere (per esempio Google). Se sei stato tu, non devi fare niente.",
  },
  identity_unlinked_notification: {
    oggetto: "Un modo di accedere è stato scollegato",
    titolo: "Accesso scollegato",
    corpo: "Dal tuo account Edilizia in Cloud è stato tolto un modo di accedere (per esempio Google). Se sei stato tu, non devi fare niente.",
  },
  mfa_factor_enrolled_notification: {
    oggetto: "Verifica in due passaggi attivata",
    titolo: "Verifica in due passaggi attivata",
    corpo: "Sul tuo account Edilizia in Cloud è stata attivata la verifica in due passaggi. Se sei stato tu, non devi fare niente.",
  },
  mfa_factor_unenrolled_notification: {
    oggetto: "Verifica in due passaggi disattivata",
    titolo: "Verifica in due passaggi disattivata",
    corpo: "Sul tuo account Edilizia in Cloud è stata tolta la verifica in due passaggi. Se sei stato tu, non devi fare niente.",
  },
};

/** Per un avviso che Supabase aggiungerà in futuro: meglio generico che sbagliato. */
const AVVISO_GENERICO: Avviso = {
  oggetto: "Una modifica al tuo account",
  titolo: "Modifica al tuo account",
  corpo: "C'è stata una modifica alla sicurezza del tuo account Edilizia in Cloud. Se sei stato tu, non devi fare niente.",
};

/** L'avviso per questo tipo di email, o null se non è un avviso. */
export function avvisoPer(azione: string): Avviso | null {
  if (!azione.endsWith("_notification")) return null;
  return AVVISI[azione] ?? AVVISO_GENERICO;
}

/** Corpo dell'avviso: cosa è successo e a chi scrivere se non si è stati noi. */
export function corpoAvviso(a: Avviso, whatsapp: string): string {
  return `<div style="max-width:560px;margin:0 auto;padding:28px;">
    <h2 style="font-family:sans-serif;font-size:19px;color:#111827;margin:0 0 10px;">${a.titolo}</h2>
    <p style="font-family:sans-serif;font-size:14px;color:#374151;line-height:1.6;margin:0 0 12px;">${a.corpo}</p>
    <p style="font-family:sans-serif;font-size:14px;color:#374151;line-height:1.6;margin:0;">
      Se non sei stato tu, scrivici subito su
      <a href="https://wa.me/${whatsapp}" style="color:#0f766e;">WhatsApp</a>.
    </p>
  </div>`;
}
