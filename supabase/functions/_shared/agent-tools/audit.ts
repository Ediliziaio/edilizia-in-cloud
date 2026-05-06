/**
 * MP-AIE-01 — Audit & Action Proposals
 *
 * Funzioni shared per:
 *   - logToolExecution → INSERT in tool_execution_log dopo ogni esecuzione
 *   - createActionProposal → crea bozza per tool yellow/red (HITL)
 *
 * Best-effort: errori di logging NON bloccano l'esecuzione tool.
 */

import type { ToolContext, ToolDefinition } from "./types.ts";

/**
 * Logga l'esecuzione di un tool (success/error/proposed) in `tool_execution_log`.
 * Non blocca: errori di logging vengono solo console.warn'd.
 */
export async function logToolExecution(
  ctx: ToolContext,
  tool: ToolDefinition,
  input: unknown,
  output: unknown,
  status: "success" | "error" | "proposed",
  errorMessage: string | null,
  proposalId: string | null,
  durationMs: number,
): Promise<void> {
  try {
    await ctx.supabase.from("tool_execution_log").insert({
      company_id: ctx.companyId,
      user_id: ctx.userId,
      persona_key: ctx.personaKey ?? null,
      channel: ctx.channel,
      tool_name: tool.name,
      tool_domain: tool.domain,
      risk_level: tool.riskLevel,
      input_payload: sanitizeJsonb(input),
      output_payload: status === "success" ? sanitizeJsonb(output) : null,
      status,
      error_message: errorMessage,
      proposal_id: proposalId,
      duration_ms: durationMs,
      trace_id: ctx.traceId ?? null,
      session_id: ctx.sessionId ?? null,
    });
  } catch (e) {
    console.warn("[agent-tools/audit] logToolExecution failed (non-blocking):",
      e instanceof Error ? e.message : String(e));
  }
}

/**
 * Crea un'action proposal per un tool yellow/red. La proposta resta in stato
 * 'pending' finché l'utente non conferma via UI (MP-AIE-03).
 *
 * Ritorna proposal_id (uuid) o stringa vuota se la creazione fallisce.
 */
export async function createActionProposal(
  ctx: ToolContext,
  tool: ToolDefinition,
  input: unknown,
): Promise<string> {
  try {
    const summary = `${tool.domain.toUpperCase()}: ${tool.description.substring(0, 150)}`;
    const { data, error } = await ctx.supabase.rpc("silvio_tool_propose_action", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_action_type: tool.name,
      p_summary: summary,
      p_payload: {
        tool_name: tool.name,
        tool_domain: tool.domain,
        input,
        channel: ctx.channel,
        session_id: ctx.sessionId,
      },
      p_session_id: null,
      p_persona_key: ctx.personaKey ?? "system",
      p_risk_level: tool.riskLevel === "red" ? "red" : "yellow",
    });
    if (error) {
      console.warn("[agent-tools/audit] createActionProposal RPC error:", error.message);
      return "";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return String(r?.proposal_id ?? "");
  } catch (e) {
    console.warn("[agent-tools/audit] createActionProposal threw:",
      e instanceof Error ? e.message : String(e));
    return "";
  }
}

/**
 * Tronca payload troppo grandi e rimuove fields potenzialmente PII pesanti
 * prima del salvataggio in `tool_execution_log`.
 */
function sanitizeJsonb(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    // Cap a 50 KB per record per evitare bloat sulla tabella
    if (json.length > 50_000) {
      return { _truncated: true, _length: json.length, _preview: json.substring(0, 1000) };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { _unserializable: true };
  }
}
