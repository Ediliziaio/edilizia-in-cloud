/**
 * Il WhatsApp della scheda contatto passa da whatsapp-send (25/09/2026), come
 * Conversazioni, l'invio rapido e le automazioni.
 *
 * Prima send-contact-message chiamava Meta da sé: nessun credito scalato,
 * nessuna riga in whatsapp_messages (quindi nessun esito della consegna), e al
 * posto del modello restava «📋 Template: nome».
 *
 * Qui i pezzi puri: il corpo della richiesta e la risposta per chi ha premuto
 * «Invia». Nessun import: lo leggono sia Deno sia i test.
 */

/** Il modello scelto nel composer: nome, lingua e i valori di {{1}}, {{2}}, … in ordine. */
export interface ModelloWhatsApp {
  name: string;
  language: string;
  variables: string[];
}

/** Il corpo per whatsapp-send: il testo libero o il modello, sempre col contatto. */
export function richiestaWhatsAppSend(p: {
  companyId: string;
  waNumberId: string | null;
  to: string;
  contactId: string;
  testo: string;
  modello: ModelloWhatsApp | null;
}): Record<string, unknown> {
  return {
    company_id: p.companyId,
    wa_number_id: p.waNumberId,
    to: p.to,
    contact_id: p.contactId,
    ...(p.modello
      ? { template: { name: p.modello.name, language: p.modello.language, variables: p.modello.variables } }
      : { text: p.testo }),
  };
}

/** Quello che risponde whatsapp-send. */
export interface EsitoWhatsAppSend {
  success?: boolean;
  meta_message_id?: string;
  error?: string;
  code?: string;
  message?: string;
  saldo_eur?: number;
}

/** La risposta per chi ha premuto «Invia»: lo stato, cosa è successo, cosa fare. */
export interface ErroreInvioWhatsApp {
  status: number;
  error: string;
  /** Il codice che nel client apre il dialog giusto (carta, add-on, crediti). */
  code: string | null;
}

// Il credito whatsapp-send lo dice col codice in `error` e la frase in
// `message`; gli altri cancelli col codice in `code` e la frase in `error`.
const CODICI_DEL_CREDITO = new Set(["insufficient_credits", "credit_check_failed", "whatsapp_disabled"]);

export function erroreInvioWhatsApp(status: number, esito: EsitoWhatsAppSend): ErroreInvioWhatsApp {
  const codice = esito.code ?? (esito.error && CODICI_DEL_CREDITO.has(esito.error) ? esito.error : null);
  switch (codice) {
    case "window_closed":
      return {
        status: 422,
        code: codice,
        error:
          "Il contatto non scrive da più di 24 ore: su WhatsApp gli puoi mandare solo un template approvato da Meta.",
      };
    case "insufficient_credits":
      return { status: 402, code: codice, error: esito.message || "Crediti WhatsApp esauriti: ricarica da Impostazioni → Crediti." };
    case "credit_check_failed":
      // Il database non ha risposto, il credito non è finito: con un 402 il
      // client aprirebbe il dialog della carta.
      return {
        status: 503,
        code: codice,
        error: "Non riesco a verificare il credito WhatsApp in questo momento: riprova tra poco.",
      };
    case "whatsapp_disabled":
      return { status: 403, code: codice, error: esito.message || "Il servizio WhatsApp è disattivato per questa azienda." };
    case "payment_method_required":
      return { status: 402, code: codice, error: esito.error || "Manca un metodo di pagamento valido per l'azienda." };
    case "whatsapp_addon_required":
      return { status: 402, code: codice, error: esito.error || "WhatsApp Business non è attivo per questa azienda." };
  }
  if (status === 502) {
    return { status: 502, code: null, error: `WhatsApp ha rifiutato il messaggio: ${esito.error || "motivo non indicato"}` };
  }
  return {
    // Un 401 qui vuol dire che la chiamata interna non è stata riconosciuta:
    // chi ha premuto «Invia» non c'entra, e il suo accesso è valido.
    status: status === 401 || status < 400 ? 502 : status,
    code: null,
    error: esito.error || esito.message || `Invio WhatsApp non riuscito (errore ${status}).`,
  };
}
