// MP03 — Helper condivisi per handler CRM-oriented (assistenza/lead/marketing).
// Risoluzione/creazione contact in marketing_contacts (unica tabella contatti
// nel DB reale di EiC, estesa con opt_out/stato/tipo/qualificazione_json).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MarketingContact {
  id: string;
  company_id: string;
  opt_out: boolean | null;
  stato: string | null;
  tipo: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  telefono_normalized: string | null;
  qualificazione_json: Record<string, unknown> | null;
}

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

function phoneVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  if (!n) return [];
  const v = new Set<string>([n]);
  if (n.startsWith("39") && n.length >= 12) v.add(n.substring(2));
  if (n.length === 10) v.add("39" + n);
  return Array.from(v);
}

export async function resolveOrCreateContact(
  supabase: SupabaseClient,
  phone: string,
  companyId: string,
  defaults: { tipo?: string; stato?: string; source?: string; firstMessage?: string },
): Promise<MarketingContact | null> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return null;

  // Match esistente
  for (const v of variants) {
    const { data } = await supabase
      .from("marketing_contacts")
      .select(
        "id, company_id, opt_out, stato, tipo, first_name, last_name, phone, telefono_normalized, qualificazione_json",
      )
      .eq("company_id", companyId)
      .eq("telefono_normalized", v)
      .maybeSingle();
    if (data) return data as MarketingContact;
  }

  // Crea nuovo
  const { data: created, error } = await supabase
    .from("marketing_contacts")
    .insert({
      company_id: companyId,
      phone: phone,
      telefono_normalized: variants[0],
      tipo: defaults.tipo ?? "cliente_prospect",
      stato: defaults.stato ?? "nuovo",
      source: defaults.source ?? "whatsapp",
      opt_out: false,
      qualificazione_json: defaults.firstMessage
        ? { first_message: defaults.firstMessage.substring(0, 200) }
        : {},
    })
    .select(
      "id, company_id, opt_out, stato, tipo, nome, cognome, telefono, telefono_normalized, qualificazione_json",
    )
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
  await supabase
    .from("marketing_contacts")
    .update({ opt_out: true, opt_out_at: new Date().toISOString() })
    .eq("id", contactId);
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
