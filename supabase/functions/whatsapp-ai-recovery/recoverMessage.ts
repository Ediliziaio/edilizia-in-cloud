import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RecoveryMessage { id: string; company_id: string; processing_attempts: number }
export type RecoveryOutcome = "processed" | "failed" | "skipped";

/** The processor owns the received→processing claim. Recovery reserves only
 * its dispatch attempt and must never overwrite a processor's terminal state.
 */
export async function recoverMessage(db: SupabaseClient, message: RecoveryMessage,
  invoke: () => Promise<Response>, maxAttempts = 5): Promise<RecoveryOutcome> {
  const next = message.processing_attempts + 1;
  const { data, error } = await db.from("whatsapp_messages")
    .update({ processing_attempts: next, last_processing_attempt_at: new Date().toISOString() })
    .eq("id", message.id).eq("company_id", message.company_id).eq("direction", "inbound")
    .eq("processing_status", "received").eq("processing_attempts", message.processing_attempts)
    .select("id");
  if (error) return "failed";
  if (data?.length !== 1) return "skipped";
  try {
    const response = await invoke();
    if (!response.ok) throw new Error(`processor_http_${response.status}`);
    const body = await response.json();
    if (body?.status === "processed" && body?.ok === true) return "processed";
    if (body?.skip === "conversation_busy") {
      // Waiting behind another turn is not a failed attempt. CAS preserves a live worker.
      await db.from("whatsapp_messages").update({ processing_attempts: message.processing_attempts })
        .eq("id", message.id).eq("company_id", message.company_id).eq("direction", "inbound")
        .eq("processing_status", "received").eq("processing_attempts", next);
      return "skipped";
    }
    if (typeof body?.skip === "string") return "skipped";
    throw new Error("processor_result_not_successful");
  } catch {
    // Timeout può significare che il processor sta ancora lavorando. Mai
    // azzerare processing, mai far ripetere AI/tool già iniziati.
    await db.from("whatsapp_messages").update({
      processing_error: "recovery_dispatch_not_confirmed",
      ...(next >= maxAttempts ? { processing_status: "failed_max_retries" } : {}),
    }).eq("id", message.id).eq("company_id", message.company_id)
      .eq("processing_status", "received").eq("processing_attempts", next);
    return "failed";
  }
}
