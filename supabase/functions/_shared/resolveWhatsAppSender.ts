// Risoluzione centralizzata del mittente WhatsApp per una azienda.
//
// Storia: il progetto è migrato dalla tabella legacy `messaging_whatsapp_config`
// (single number per azienda) alla nuova `ai_whatsapp_numbers` (multi-numero per
// scopo). Diverse edge function di invio leggevano ancora SOLO la tabella legacy
// → invio rotto (OAuthException / "non configurato") per le aziende collegate col
// nuovo flusso. Questo helper unifica la logica: preferisce un numero nuovo
// attivo + webhook-verificato, con fallback al legacy, e ritorna il token già
// decifrato pronto all'uso.
//
// Usare SEMPRE questo helper nei percorsi di invio/lettura credenziali WhatsApp.
//
// Add-on WhatsApp Business (15/09/2026): il mittente si restituisce solo se
// l'azienda ha WhatsApp nel piano, l'add-on pagato o lo sblocco del super admin
// (vedi whatsappAddon.ts). Passano di qui automazioni, risposte dalla inbox,
// messaggi da contatti e ordini, template e il vecchio broadcast.

import { decryptMaybeEncrypted, getEncryptionKey } from "./encryption.ts";
import { addonWhatsAppAttivo } from "./whatsappAddon.ts";

export interface WhatsAppSender {
  /** ID numero (Graph API): https://graph.facebook.com/v21.0/<phoneNumberId>/messages */
  phoneNumberId: string;
  /** WhatsApp Business Account ID (serve per i template). Può essere null sul legacy. */
  wabaId: string | null;
  /** Access token GIÀ DECIFRATO, pronto per Authorization: Bearer. */
  accessToken: string;
  /** Numero in formato E.164 (solo per log/UI). */
  numero: string | null;
  /** Da quale tabella è arrivata la config (diagnostica). */
  source: "ai_whatsapp_numbers" | "messaging_whatsapp_config";
}

// Tipizzazione minima e strutturale del client Supabase (coerente con gli altri
// helper in _shared, es. billingConfig.ts) per non accoppiarsi a supabase-js.
interface MinimalClient {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
}

/**
 * Risolve le credenziali WhatsApp per `companyId`.
 * @returns il mittente pronto all'uso, oppure `null` se nessuna config valida
 *   o se l'azienda non ha l'add-on WhatsApp Business.
 */
export async function resolveWhatsAppSender(
  client: MinimalClient,
  companyId: string,
  preferredNumberId?: string | null,
): Promise<WhatsAppSender | null> {
  // Se la verifica dell'add-on non risponde si procede: un intoppo del
  // database non deve far perdere un messaggio già dovuto.
  if (!(await addonWhatsAppAttivo(client, companyId, { seNonVerificabile: "consenti" }))) {
    console.warn(`[wa-addon] ${companyId}: add-on WhatsApp non attivo, nessun mittente`);
    return null;
  }

  let phoneNumberId: string | null = null;
  let wabaId: string | null = null;
  let encToken: string | null = null;
  let numero: string | null = null;
  let source: WhatsAppSender["source"] = "ai_whatsapp_numbers";

  // 0) Se è stato scelto un numero specifico (UI), usa QUELLO (se valido).
  let waNumber: any = null;
  if (preferredNumberId) {
    const { data } = await client
      .from("ai_whatsapp_numbers")
      .select("phone_number_id, waba_id, access_token_encrypted, numero")
      .eq("id", preferredNumberId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    waNumber = data ?? null;
  }

  // 1) Altrimenti: nuovo multi-numero, numero attivo + webhook verificato, il più recente.
  if (!waNumber?.phone_number_id) {
    const { data } = await client
      .from("ai_whatsapp_numbers")
      .select("phone_number_id, waba_id, access_token_encrypted, numero")
      .eq("company_id", companyId)
      .eq("stato", "active")
      .eq("webhook_verified", true)
      .not("access_token_encrypted", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    waNumber = data ?? null;
  }

  if (waNumber?.phone_number_id && waNumber?.access_token_encrypted) {
    phoneNumberId = waNumber.phone_number_id;
    wabaId = waNumber.waba_id ?? null;
    encToken = waNumber.access_token_encrypted;
    numero = waNumber.numero ?? null;
  } else {
    // 2) Fallback: tabella legacy single-number.
    const { data: legacy } = await client
      .from("messaging_whatsapp_config")
      .select("phone_number_id, waba_id, access_token_encrypted")
      .eq("company_id", companyId)
      .eq("is_connected", true)
      .maybeSingle();

    if (legacy?.phone_number_id && legacy?.access_token_encrypted) {
      phoneNumberId = legacy.phone_number_id;
      wabaId = legacy.waba_id ?? null;
      encToken = legacy.access_token_encrypted;
      source = "messaging_whatsapp_config";
    }
  }

  if (!phoneNumberId || !encToken) return null;

  const accessToken = await decryptMaybeEncrypted(encToken, getEncryptionKey());
  return { phoneNumberId, wabaId, accessToken, numero, source };
}
