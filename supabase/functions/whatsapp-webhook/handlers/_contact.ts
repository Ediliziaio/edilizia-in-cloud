// MP03 — Helper condivisi per handler CRM-oriented (assistenza/lead/marketing).
// Risoluzione/creazione contact in marketing_contacts (unica tabella contatti
// nel DB reale di EiC, estesa con opt_out/stato/tipo/qualificazione_json).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { nomeDalProfilo } from "../contattoDaWhatsApp.ts";

export interface MarketingContact {
  id: string;
  company_id: string;
  opt_out: boolean | null;
  optout_whatsapp: boolean | null;
  stato: string | null;
  tipo: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  telefono_normalized: string | null;
  qualificazione_json: Record<string, unknown> | null;
}

const COLONNE_CONTATTO =
  "id, company_id, opt_out, optout_whatsapp, stato, tipo, first_name, last_name, phone, telefono_normalized, qualificazione_json";

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export async function resolveOrCreateContact(
  supabase: SupabaseClient,
  phone: string,
  companyId: string,
  defaults: { tipo?: string; stato?: string; source?: string; firstMessage?: string; profileName?: string },
): Promise<MarketingContact | null> {
  const cifre = normalizePhone(phone);
  if (!cifre) return null;

  // Match esistente: lo stesso numero scritto in qualunque modo («+39 348…»,
  // «348…»), via contatto_da_telefono. Prima si cercava solo in
  // telefono_normalized, compilato su un contatto su quattro: gli altri non
  // venivano trovati e se ne creava uno nuovo.
  const { data: esistente, error: errCerca } = await supabase.rpc("contatto_da_telefono", {
    p_company_id: companyId,
    p_telefono: cifre,
  });
  if (errCerca) {
    console.error(
      JSON.stringify({ level: "error", fn: "resolveOrCreateContact", msg: "lookup failed", error: errCerca.message }),
    );
    // Senza sapere se c'è già, non se ne crea un doppione.
    return null;
  }
  if (esistente) {
    const { data } = await supabase
      .from("marketing_contacts")
      .select(COLONNE_CONTATTO)
      .eq("id", esistente as string)
      .maybeSingle();
    if (data) return data as MarketingContact;
  }

  // Crea nuovo. first_name è obbligatorio: il nome del profilo WhatsApp, se c'è.
  const { nome, cognome } = nomeDalProfilo(defaults.profileName);
  const { data: created, error } = await supabase
    .from("marketing_contacts")
    .insert({
      company_id: companyId,
      first_name: nome,
      last_name: cognome,
      phone: `+${cifre}`,
      telefono_normalized: cifre,
      tipo: defaults.tipo ?? "cliente_prospect",
      stato: defaults.stato ?? "nuovo",
      source: defaults.source ?? "whatsapp",
      opt_out: false,
      qualificazione_json: defaults.firstMessage
        ? { first_message: defaults.firstMessage.substring(0, 200) }
        : {},
    })
    .select(COLONNE_CONTATTO)
    .single();

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "resolveOrCreateContact",
        msg: "insert failed",
        error: error.message,
      }),
    );
    return null;
  }

  return created as MarketingContact;
}

const STOP_WORDS = new Set([
  "stop",
  "basta",
  "unsubscribe",
  "cancellami",
  "rimuovi",
  "stop!",
  "no grazie basta",
]);

export function isStopMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  const normalized = body.trim().toLowerCase();
  return STOP_WORDS.has(normalized);
}

export async function markOptOut(
  supabase: SupabaseClient,
  contactId: string,
): Promise<void> {
  // optout_whatsapp è quello che guardano gli invii (automazioni, scheda
  // contatto): con il solo opt_out il cliente riceveva «rimosso» e poi altri
  // messaggi.
  await supabase
    .from("marketing_contacts")
    .update({ opt_out: true, optout_whatsapp: true, opt_out_at: new Date().toISOString() })
    .eq("id", contactId);
}

/**
 * Fa partire le automazioni «Quando arriva un WhatsApp» (whatsapp_ricevuto).
 * Prima le emetteva solo il bot operativo e il WhatsApp Locale: sui numeri
 * collegati a Meta per marketing, lead e assistenza non partivano mai.
 */
export async function avvisaAutomazioni(
  supabase: SupabaseClient,
  ctx: InboundContext,
  contactId: string,
  messageId: string | null,
): Promise<void> {
  const { waNumber, extracted, senderPhone, msg } = ctx;
  const { error } = await supabase.from("automation_trigger_events").insert({
    company_id: waNumber.company_id,
    trigger_event: "whatsapp_message_received",
    entity_id: contactId,
    entity_type: "contact",
    payload: {
      from: normalizePhone(senderPhone),
      message: extracted.content,
      channel: "whatsapp",
      message_type: extracted.messageType,
      metadata: extracted.metadata,
      wa_number_id: waNumber.id,
      wa_message_id: msg.id ?? null,
      message_id: messageId,
      purpose: waNumber.purpose,
      legacy_events: ["whatsapp_received", "customer_replied"],
    },
  });
  if (error) {
    console.error(
      JSON.stringify({ level: "error", fn: "avvisaAutomazioni", msg: "insert failed", error: error.message }),
    );
  }
}

export async function sendPlainReply(
  waNumberId: string,
  companyId: string,
  to: string,
  text: string,
): Promise<void> {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to, text }),
    });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      console.error(
        JSON.stringify({ level: "error", fn: "sendPlainReply", msg: "whatsapp-send failed", status: res.status, body: b }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", fn: "sendPlainReply", error: String(e) }),
    );
  }
}
