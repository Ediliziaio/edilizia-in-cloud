// MP01 — Logging errori di routing webhook WhatsApp.
// Mai throwa: in caso di fallimento, log e go. Le edge function devono
// SEMPRE tornare 200 a Meta per non innescare sospensione webhook.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ErrorKind =
  | "unknown_phone_number_id"
  | "hmac_invalid"
  | "payload_malformed"
  | "company_disabled"
  | "purpose_not_configured"
  | "agent_not_found"
  | "rate_limit_exceeded";

export interface RoutingErrorEntry {
  error_kind: ErrorKind;
  phone_number_id?: string | null;
  wa_message_id?: string | null;
  payload_excerpt?: string | null;
  error_detail?: string | null;
}

export async function logRoutingError(
  supabase: SupabaseClient,
  entry: RoutingErrorEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("wa_routing_errors").insert({
      error_kind: entry.error_kind,
      phone_number_id: entry.phone_number_id ?? null,
      wa_message_id: entry.wa_message_id ?? null,
      payload_excerpt: entry.payload_excerpt?.substring(0, 500) ?? null,
      error_detail: entry.error_detail ?? null,
    });
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "logRoutingError",
          msg: "insert failed",
          error: error.message,
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "logRoutingError",
        msg: "exception",
        error: String(e),
      }),
    );
  }
}
