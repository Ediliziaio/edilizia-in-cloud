/**
 * Credito WhatsApp — una sola regola, un solo posto.
 *
 * Prima il controllo del saldo viveva in due edge function su tre:
 * whatsapp-broadcast e send-whatsapp-reply lo facevano, whatsapp-send no. Ma è
 * whatsapp-send che serve il bot, i promemoria operativi, le notifiche, i
 * report e il primo contatto sui lead: il percorso più usato era anche l'unico
 * gratuito. Un'azienda a saldo zero continuava a mandare messaggi a pagamento,
 * e nessuno se ne accorgeva perché non c'era nemmeno un errore.
 *
 * Qui c'è la regola, e whatsapp-send la applica prima di chiamare Meta.
 *
 * Perché addebitare PRIMA e non dopo: il vecchio schema (controlla, invia,
 * addebita) lascia due buchi. Fra il controllo e l'addebito un altro invio può
 * consumare l'ultimo credito — e a quel punto il messaggio è già partito, il
 * deduct fallisce e resta solo una riga di log. E se l'addebito fallisce per
 * qualunque altro motivo, il messaggio è comunque uscito gratis.
 * consume_credits è atomica (FOR UPDATE + scrittura del registro): addebitare
 * prima significa che a credito zero il messaggio non parte affatto. Se poi Meta
 * rifiuta, si rimborsa — un rimborso mancato costa un centesimo di euro, un
 * messaggio non fatturato costa tutti quelli che seguono.
 */

import { getCompanyBillingConfig } from "./billingConfig.ts";

// deno-lint-ignore no-explicit-any
type ClientAdmin = any;

/** Prezzo di riserva quando l'azienda non ha un listino dedicato. */
export const PREZZO_MESSAGGIO_DEFAULT_EUR = 0.0006;

export interface EsitoAddebito {
  /** true = si può inviare. */
  consentito: boolean;
  /** Quanto è stato addebitato: 0 se l'azienda è esente. */
  addebitato: number;
  /** Codice macchina per il chiamante: whatsapp_disabled | insufficient_credits. */
  codice?: string;
  /** Messaggio per l'utente, in italiano e con l'azione da fare. */
  messaggio?: string;
  /** Saldo residuo, quando lo conosciamo. */
  saldo?: number;
}

/**
 * Verifica e addebita in un colpo solo. Da chiamare PRIMA di consegnare il
 * messaggio al provider.
 */
export async function addebitaMessaggioWhatsApp(
  admin: ClientAdmin,
  companyId: string,
  descrizione: string,
  metadata: Record<string, unknown> = {},
): Promise<EsitoAddebito> {
  const billing = await getCompanyBillingConfig(admin, companyId, "whatsapp");

  if (!billing.isEnabled) {
    return {
      consentito: false,
      addebitato: 0,
      codice: "whatsapp_disabled",
      messaggio: "Il servizio WhatsApp è disattivato per questa azienda.",
    };
  }

  // Aziende in omaggio (comped): nessun addebito, nessun blocco.
  if (billing.isFree) {
    return { consentito: true, addebitato: 0 };
  }

  const prezzo = billing.pricePerUnitEur ?? PREZZO_MESSAGGIO_DEFAULT_EUR;

  // Il wallet può essere bloccato anche con saldo residuo (sospensione
  // amministrativa): va guardato prima, perché consume_credits non lo legge.
  const { data: wallet } = await admin
    .from("whatsapp_credits")
    .select("balance_eur, sends_blocked")
    .eq("company_id", companyId)
    .maybeSingle();

  const saldo = Number(wallet?.balance_eur ?? 0);

  if (wallet?.sends_blocked) {
    return {
      consentito: false,
      addebitato: 0,
      codice: "insufficient_credits",
      saldo,
      messaggio:
        "Invii WhatsApp sospesi: il credito è esaurito. Ricarica da Impostazioni → Crediti per riattivarli.",
    };
  }

  const { data: esito, error } = await admin.rpc("consume_credits", {
    p_company_id: companyId,
    p_credit_type: "whatsapp",
    p_amount: prezzo,
    p_description: descrizione,
    p_metadata: metadata,
  });

  if (error) {
    // Non si invia al buio: se non sappiamo addebitare, non spediamo.
    return {
      consentito: false,
      addebitato: 0,
      codice: "credit_check_failed",
      saldo,
      messaggio: `Impossibile verificare il credito WhatsApp: ${error.message}`,
    };
  }

  const r = esito as { success?: boolean; balance_after?: number; balance_before?: number } | null;
  if (r?.success !== true) {
    return {
      consentito: false,
      addebitato: 0,
      codice: "insufficient_credits",
      saldo: Number(r?.balance_before ?? saldo),
      messaggio:
        `Crediti WhatsApp esauriti (saldo ${Number(r?.balance_before ?? saldo).toFixed(4)} €, ` +
        `servono ${prezzo.toFixed(4)} € per messaggio). Ricarica da Impostazioni → Crediti.`,
    };
  }

  return { consentito: true, addebitato: prezzo, saldo: Number(r?.balance_after ?? saldo) };
}

/**
 * Restituisce il credito quando il messaggio non è partito davvero.
 * Non solleva: un rimborso mancato si riconcilia, un'eccezione qui
 * nasconderebbe l'errore vero (quello del provider) al chiamante.
 */
export async function rimborsaMessaggioWhatsApp(
  admin: ClientAdmin,
  companyId: string,
  importo: number,
  motivo: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!(importo > 0)) return;
  try {
    const { error } = await admin.rpc("add_whatsapp_credits_with_log", {
      p_company_id: companyId,
      p_amount: importo,
      p_type: "refund",
      p_description: motivo,
      p_metadata: metadata,
    });
    if (error) {
      console.error("[whatsappCredits] rimborso fallito (da riconciliare):", error.message);
    }
  } catch (err) {
    console.error("[whatsappCredits] rimborso fallito (da riconciliare):", err);
  }
}
