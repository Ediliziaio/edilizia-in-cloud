/**
 * Quali errori di Meta fermano TUTTO il canale WhatsApp, e cosa fare per ripartire (27/10/2026).
 *
 * Il Bagno Group: dal 1° ottobre ogni messaggio ai lead è stato respinto con «problema di pagamento sull'account»
 * (codice 131042). 77 messaggi mai partiti in 26 giorni: i clienti non ricevevano niente, non rispondevano, e
 * l'assistente WhatsApp non ha più fissato un appuntamento. Nessuno è stato avvisato, perché il motivo stava solo
 * in `whatsapp_messages.delivery_error`.
 *
 * Qui si distingue il guasto del CANALE (l'account non può più scrivere a nessuno: va detto subito) dal rifiuto del
 * singolo destinatario (numero non su WhatsApp, fuori dalle 24 ore, cliente che ha bloccato: normale).
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

/**
 * I codici che fermano il canale
 * (developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes).
 * Fuori di proposito: 131026 (numero non su WhatsApp), 131047 (servirebbe un modello), 131050 (il cliente ha
 * bloccato), 131056 (troppi messaggi a quel numero), 132xxx (il singolo modello).
 */
export const CODICI_CANALE_FERMO: Record<number, string> = {
  368: "l'account è temporaneamente bloccato da Meta",
  131031: "l'account WhatsApp Business è bloccato",
  131042: "c'è un problema di pagamento sull'account Meta",
  131045: "il numero non è registrato correttamente su Meta",
  131048: "Meta ha limitato gli invii: troppi messaggi segnalati come spam",
};

/** Che cosa deve fare l'azienda per ripartire, per ciascun guasto. */
export const COSA_FARE: Record<number, string> = {
  368: "Entra in business.facebook.com e controlla le segnalazioni sull'account: finché è bloccato non parte nessun messaggio.",
  131031: "L'account WhatsApp Business è stato bloccato da Meta: apri business.facebook.com → Qualità dell'account per vedere il motivo e fare ricorso.",
  131042: "Entra in business.facebook.com → Impostazioni di pagamento e sistema il metodo di pagamento (carta scaduta o rifiutata). Appena è a posto i messaggi ripartono da soli.",
  131045: "Il numero va registrato di nuovo su Meta: dalle impostazioni WhatsApp dell'app, oppure scrivici.",
  131048: "Meta ha ridotto il limite di invio per troppe segnalazioni: rallenta i messaggi e controlla la qualità del numero su business.facebook.com.",
};

/**
 * Il testo che il webhook salva in `whatsapp_messages.delivery_error` per questi codici
 * (whatsapp-webhook/esitoConsegna.ts → MOTIVI). Serve a riconoscere un canale già fermo dai messaggi
 * respinti nei giorni scorsi, quando il codice numerico non è più a portata di mano.
 * Un test controlla che questi testi siano ancora quelli di MOTIVI.
 */
export const MOTIVO_SALVATO: Record<number, string> = {
  368: "account temporaneamente bloccato da Meta",
  131031: "l'account WhatsApp Business è bloccato",
  131042: "problema di pagamento sull'account Meta",
  131045: "numero non registrato correttamente",
  131048: "troppi messaggi segnalati come spam: Meta limita il numero",
};

/** Da quel testo al codice: null se non è un guasto del canale. */
export function codiceDalMotivoSalvato(testo: string | null | undefined): number | null {
  const t = String(testo ?? "").trim();
  if (!t) return null;
  for (const [codice, motivo] of Object.entries(MOTIVO_SALVATO)) {
    if (t === motivo) return Number(codice);
  }
  return null;
}

export function canaleFermo(codice: number | null): boolean {
  return codice != null && codice in CODICI_CANALE_FERMO;
}

export function cosaFarePerRipartire(codice: number): string {
  return COSA_FARE[codice] ?? "Controlla l'account WhatsApp Business su business.facebook.com.";
}
