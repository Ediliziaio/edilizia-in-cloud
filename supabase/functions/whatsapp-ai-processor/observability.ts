// MP02 — Logging tool calls in wa_tool_calls per dashboard observability.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estimateCostEur } from "./budget.ts";

export interface ToolCallLog {
  company_id: string;
  wa_message_id: string | null;
  tool_name: string;
  role_kind: string;
  args: unknown;
  result: { ok: boolean; [k: string]: unknown };
  duration_ms: number;
  model_used?: string;
  tokens_prompt?: number;
  tokens_completion?: number;
}

export async function logToolCall(
  supabase: SupabaseClient,
  entry: ToolCallLog,
): Promise<void> {
  const costEur = estimateCostEur(
    entry.model_used,
    entry.tokens_prompt,
    entry.tokens_completion,
  );

  const summaryText =
    typeof entry.result === "object"
      ? JSON.stringify(entry.result).substring(0, 500)
      : String(entry.result).substring(0, 500);

  try {
    await supabase.from("wa_tool_calls").insert({
      company_id: entry.company_id,
      wa_message_id: entry.wa_message_id,
      tool_name: entry.tool_name,
      role_kind: entry.role_kind,
      args_json: entry.args,
      result_ok: entry.result?.ok === true,
      result_summary: summaryText,
      duration_ms: entry.duration_ms,
      model_used: entry.model_used ?? null,
      tokens_prompt: entry.tokens_prompt ?? null,
      tokens_completion: entry.tokens_completion ?? null,
      cost_eur: costEur,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "logToolCall",
        msg: "insert failed",
        error: String(e),
      }),
    );
  }
}
