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

import { decryptMaybeEncrypted, getEncryptionKey } from "./encryption.ts";

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
}

/**
 * Risolve le credenziali WhatsApp per `companyId`.
 * @returns il mittente pronto all'uso, oppure `null` se nessuna config valida.
 */
export async function resolveWhatsAppSender(
  client: MinimalClient,
  companyId: string,
): Promise<WhatsAppSender | null> {
  let phoneNumberId: string | null = null;
  let wabaId: string | null = null;
  let encToken: string | null = null;
  let numero: string | null = null;
  let source: WhatsAppSender["source"] = "ai_whatsapp_numbers";

  // 1) Nuovo multi-numero: numero attivo + webhook verificato, il più recente.
  const { data: waNumber } = await client
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
