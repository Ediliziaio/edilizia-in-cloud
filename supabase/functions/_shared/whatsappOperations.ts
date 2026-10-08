import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRequestHash } from "./aiRequestGuard.ts";

export class WhatsAppOperationError extends Error {
  constructor(public code: string) { super(code); }
}
export interface WhatsAppOperation { id: string; owner: string; replay?: Record<string, unknown> }

export async function claimWhatsAppOperation(db: SupabaseClient, company: string, kind: "send" | "tool", key: string,
  fingerprint: unknown, context: Record<string, unknown>): Promise<WhatsAppOperation> {
  const owner = crypto.randomUUID();
  const { data, error } = await db.rpc("whatsapp_operation_claim", {
    p_company: company, p_key: key, p_kind: kind, p_fingerprint: await aiRequestHash(fingerprint), p_owner: owner, p_context: context,
  });
  if (!error && data?.state === "conflict") throw new WhatsAppOperationError("operation_conflict");
  if (error || !data?.id) throw new WhatsAppOperationError("operation_store_unavailable");
  if (data.state === "completed" && data.result) return { id: data.id, owner, replay: data.result };
  if (data.state !== "claimed") throw new WhatsAppOperationError(data.state === "running" ? "operation_in_progress" : `operation_${data.state}`);
  return { id: data.id, owner };
}
export async function finishWhatsAppOperation(db: SupabaseClient, operation: WhatsAppOperation,
  status: "completed" | "rejected" | "unknown", result: unknown, providerId?: string) {
  const { data, error } = await db.rpc("whatsapp_operation_finish", {
    p_id: operation.id, p_owner: operation.owner, p_status: status, p_result: result, p_provider_id: providerId ?? null,
  });
  if (error || data !== true) throw new WhatsAppOperationError("operation_result_not_saved");
}

export async function runWhatsAppTool<T>(db: SupabaseClient, company: string, key: string, name: string,
  args: unknown, execute: () => Promise<T>): Promise<T> {
  const operation = await claimWhatsAppOperation(db, company, "tool", key, [name, args], { tool_name: name });
  if (operation.replay) return operation.replay as T;
  try {
    const result = await execute();
    await finishWhatsAppOperation(db, operation, "completed", result);
    return result;
  } catch (error) {
    try { await finishWhatsAppOperation(db, operation, "unknown", { error: "tool_result_not_confirmed" }); } catch { /* running still blocks repetition */ }
    throw error;
  }
}
