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
