import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";

const TIPI_CON_INDICATORE = new Set(["text", "audio", "image", "document", "video", "interactive", "button", "location"]);

interface MessaggioPerIndicatore {
  id: string;
  company_id: string;
  wa_number_id: string | null;
  wa_message_id: string | null;
  to_phone: string | null;
  message_type: string | null;
}

/** Segnala la presa in carico a Meta in parallelo con l'elaborazione. */
export function avviaIndicatoreScrittura(
  supabase: SupabaseClient,
  msg: MessaggioPerIndicatore,
): AbortController | undefined {
  const { wa_message_id, wa_number_id, to_phone } = msg;
  if (!wa_number_id || !wa_message_id || !/^wamid\.[A-Za-z0-9_+\/=.-]{1,500}$/.test(wa_message_id) ||
      !to_phone || !/^\d{5,30}$/.test(to_phone) || !TIPI_CON_INDICATORE.has(msg.message_type ?? "")) return;

  const indicatore = new AbortController();
  const signal = AbortSignal.any([indicatore.signal, AbortSignal.timeout(3_000)]);
  const invio = (async () => {
    const mittente = await resolveWhatsAppSender(supabase, msg.company_id, wa_number_id);
    // Il resolver può avere un fallback. L'ID Meta deve coincidere con il
    // numero che ha ricevuto questo specifico messaggio.
    if (signal.aborted || mittente?.phoneNumberId !== to_phone) return;
    const risposta = await fetch("https://graph.facebook.com/v25.0/" + to_phone + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + mittente.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: wa_message_id,
        typing_indicator: { type: "text" },
      }),
      redirect: "error",
      signal,
    });
    await risposta.body?.cancel();
    if (!risposta.ok) console.warn("indicatore_whatsapp_rifiutato", { message_id: msg.id, status: risposta.status });
  })().catch(() => {
    if (!indicatore.signal.aborted) console.warn("indicatore_whatsapp_non_disponibile", { message_id: msg.id });
  });
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(invio);
  return indicatore;
}

export class WhatsAppDeliveryError extends Error {
  constructor(public readonly reason: "rejected" | "unknown", public readonly status?: number) {
    super(`whatsapp_reply_${reason}${status ? `_${status}` : ""}`);
    this.name = "WhatsAppDeliveryError";
  }
}

/** Accettazione dell'invio ≠ consegna al telefono (quella arriva dal webhook).
 * Non ritenta un timeout: il provider potrebbe avere già accettato il messaggio.
 */
export async function deliverWhatsAppReply(body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new WhatsAppDeliveryError(res.status >= 500 ? "unknown" : "rejected", res.status);
    const result = await res.json();
    if (result?.success !== true || typeof result?.meta_message_id !== "string" || !result.meta_message_id) {
      throw new WhatsAppDeliveryError("unknown", res.status);
    }
  } catch (error) {
    if (error instanceof WhatsAppDeliveryError) throw error;
    throw new WhatsAppDeliveryError("unknown");
  }
}
