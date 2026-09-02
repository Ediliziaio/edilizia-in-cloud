/**
 * telnyxApiKey — UNA sola risposta alla domanda "con quale chiave parlo a Telnyx?".
 *
 * Il guasto: telnyx_settings.api_key_encrypted in produzione e' una stringa
 * VUOTA, mentre il secret TELNYX_API_KEY esiste ed e' sano. Ogni funzione che
 * leggeva solo la tabella (link_phone_number nel proxy ElevenLabs, l'SMS degli
 * agenti interni) falliva con "Telnyx non configurato" — con la chiave giusta
 * a un metro di distanza. Qui: env prima (e' il secret store), tabella dopo,
 * e la tabella si legge tollerando sia il valore cifrato sia quello in chiaro.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptMaybeEncrypted, getEncryptionKey } from "./encryption.ts";

export interface TelnyxAccesso {
  apiKey: string;
  connectionId: string | null;
  messagingProfileId: string | null;
}

export async function risolviTelnyx(admin: SupabaseClient): Promise<TelnyxAccesso | null> {
  const { data: s } = await admin
    .from("telnyx_settings")
    .select("api_key_encrypted, connection_id, messaging_profile_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let apiKey = (Deno.env.get("TELNYX_API_KEY") ?? "").trim();
  if (!apiKey && s?.api_key_encrypted) {
    try {
      apiKey = (await decryptMaybeEncrypted(String(s.api_key_encrypted), getEncryptionKey())).trim();
    } catch (e) {
      console.error("[telnyxApiKey] decifratura fallita:", e instanceof Error ? e.message : e);
    }
  }
  if (!apiKey) return null;

  return {
    apiKey,
    connectionId: (s?.connection_id as string | null) || Deno.env.get("TELNYX_WEBRTC_CONNECTION_ID") || null,
    messagingProfileId: (s?.messaging_profile_id as string | null) || Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || null,
  };
}

/**
 * Numero mittente per SMS/chiamate di un'azienda: prima il pool voce v2, poi
 * i numeri SMS, poi i numeri virtuali. Tutti nello stesso account Telnyx.
 */
export async function numeroMittenteAzienda(admin: SupabaseClient, companyId: string): Promise<string | null> {
  const { data: v2 } = await admin.from("ai_phone_numbers_v2")
    .select("numero").eq("company_id", companyId).eq("attivo", true).limit(1).maybeSingle();
  if (v2?.numero) return String(v2.numero);
  const { data: sms } = await admin.from("sms_telnyx_numbers")
    .select("numero_e164").eq("company_id", companyId).eq("stato", "attivo").limit(1).maybeSingle();
  if (sms?.numero_e164) return String(sms.numero_e164);
  const { data: vp } = await admin.from("virtual_phone_numbers")
    .select("phone_number").eq("company_id", companyId).eq("is_active", true).limit(1).maybeSingle();
  return vp?.phone_number ? String(vp.phone_number) : null;
}
