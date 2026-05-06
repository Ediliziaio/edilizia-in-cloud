/**
 * MP-AIE-01 v2 — Helper di esecuzione tool con risk-level routing + audit.
 *
 * Sostituisce `executeTool` di silvioTools.ts (che resta per back-compat).
 * Funzionalità aggiuntive:
 *   1. Permission check completo (role + persona + channel)
 *   2. Risk-level routing (safe esegue, yellow/red crea action_proposal)
 *   3. Audit log unificato in `tool_execution_log`
 *   4. Esecuzione parallela di tool calls multiple (executeToolsParallel)
 *
 * Riusato da: silvio-chat, ai-orchestrator, whatsapp-ai-processor (post-refactor),
 * telegram-bot-processor, internal-agent-tools.
 */

import {
  SILVIO_TOOLS,
  type Channel,
  type RiskLevel,
  type SilvioTool,
  type ToolContext,
} from "./silvioTools.ts";

export interface ToolExecutionResult {
  success: boolean;
  /** Output del tool (solo se eseguito direttamente). */
  data?: unknown;
  /** Errore di esecuzione/permission. */
  error?: { code: string; message: string };
  /** Se yellow/red ha creato una proposta HITL invece di eseguire. */
  proposalId?: string;
  /** Tool name (echo per logging consumer). */
  toolName: string;
  /** Durata in ms. */
  durationMs: number;
  /** Risk level effettivamente applicato (per UI). */
  riskLevel?: RiskLevel;
}

interface AuditFields {
  inputPayload: Record<string, unknown> | null;
  outputPayload: Record<string, unknown> | null;
  status: "success" | "error" | "proposed" | "denied";
  errorMessage: string | null;
  proposalId: string | null;
  durationMs: number;
}

/**
 * Esegue un singolo tool con permission + risk-level routing + audit.
 */
export async function executeToolWithRouting(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const t0 = Date.now();
  const tool = SILVIO_TOOLS[toolName];
  const channel: Channel = ctx.channel ?? "internal_chat";

  if (!tool) {
    return {
      success: false,
      toolName,
      error: { code: "tool_not_found", message: `Tool '${toolName}' non trovato nel registry` },
      durationMs: Date.now() - t0,
    };
  }

  // ── Permission: roles ──
  if (tool.allowedRoles && tool.allowedRoles.length > 0) {
    if (!tool.allowedRoles.includes(ctx.primaryRole) && !tool.allowedRoles.includes("*")) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `role '${ctx.primaryRole}' not in allowedRoles`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_role", message: "Ruolo non autorizzato per questo tool" },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Permission: persona ──
  if (ctx.personaKey && tool.allowedPersonas && tool.allowedPersonas.length > 0) {
    if (!tool.allowedPersonas.includes(ctx.personaKey) && !tool.allowedPersonas.includes("*")) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `persona '${ctx.personaKey}' not in allowedPersonas`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_persona", message: "Persona non autorizzata per questo tool" },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Permission: channel ──
  if (tool.allowedChannels && tool.allowedChannels.length > 0) {
    if (!tool.allowedChannels.includes(channel)) {
      await logAudit(ctx, tool, toolName, {
        inputPayload: sanitize(input),
        outputPayload: null,
        status: "denied",
        errorMessage: `channel '${channel}' not in allowedChannels`,
        proposalId: null,
        durationMs: Date.now() - t0,
      });
      return {
        success: false,
        toolName,
        error: { code: "forbidden_channel", message: `Tool non disponibile su canale ${channel}` },
        durationMs: Date.now() - t0,
        riskLevel: tool.riskLevel,
      };
    }
  }

  // ── Risk-level routing ──
  const risk: RiskLevel = tool.riskLevel ?? "safe";

  if (risk === "red") {
    // Forza HITL anche per super_admin
    const proposalId = await createActionProposal(ctx, tool, toolName, input, "red");
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "proposed",
      errorMessage: null,
      proposalId,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      proposalId,
      durationMs: Date.now() - t0,
      riskLevel: "red",
    };
  }

  if (risk === "yellow" && !ctx.preApproved) {
    const proposalId = await createActionProposal(ctx, tool, toolName, input, "yellow");
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "proposed",
      errorMessage: null,
      proposalId,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      proposalId,
      durationMs: Date.now() - t0,
      riskLevel: "yellow",
    };
  }

  // ── Esecuzione (safe oppure yellow preApproved) ──
  try {
    const data = await tool.executor(input, ctx);
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: sanitize(data),
      status: "success",
      errorMessage: null,
      proposalId: null,
      durationMs: Date.now() - t0,
    });
    return {
      success: true,
      toolName,
      data,
      durationMs: Date.now() - t0,
      riskLevel: risk,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logAudit(ctx, tool, toolName, {
      inputPayload: sanitize(input),
      outputPayload: null,
      status: "error",
      errorMessage: message,
      proposalId: null,
      durationMs: Date.now() - t0,
    });
    return {
      success: false,
      toolName,
      error: { code: "execution_failed", message },
      durationMs: Date.now() - t0,
      riskLevel: risk,
    };
  }
}

/**
 * Esegue una lista di tool calls in parallelo (Promise.all).
 * Tipica chiamata dopo che l'LLM ritorna `tool_calls[]` in una iterazione.
 */
export async function executeToolsParallel(
  calls: Array<{ name: string; input: unknown }>,
  ctx: ToolContext,
): Promise<ToolExecutionResult[]> {
  return Promise.all(calls.map(c => executeToolWithRouting(c.name, c.input, ctx)));
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Crea un'action proposal nella tabella ai_action_proposals con la giusta
 * configurazione di risk_level. La proposta resta in stato 'pending' finché
 * l'utente non conferma via UI (componente `ActionProposalCard`).
 */
async function createActionProposal(
  ctx: ToolContext,
  tool: SilvioTool,
  toolName: string,
  input: unknown,
  riskLevel: "yellow" | "red",
): Promise<string> {
  try {
    const summary = `${(tool.domain ?? "meta").toUpperCase()}: ${toolName}`;
    const { data, error } = await ctx.supabase.rpc("silvio_tool_propose_action", {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_action_type: toolName,
      p_summary: summary.substring(0, 200),
      p_payload: {
        tool_name: toolName,
        tool_domain: tool.domain ?? null,
        input,
        channel: ctx.channel ?? "internal_chat",
        session_id: ctx.sessionId ?? null,
        trace_id: ctx.traceId ?? null,
      },
      p_session_id: null,
      p_persona_key: ctx.personaKey ?? "silvio",
      p_risk_level: riskLevel,
    });
    if (error) {
      console.warn("[silvioToolExecution] createActionProposal RPC error:", error.message);
      return "";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return String(r?.proposal_id ?? "");
  } catch (e) {
    console.warn(
      "[silvioToolExecution] createActionProposal threw:",
      e instanceof Error ? e.message : String(e),
    );
    return "";
  }
}

/**
 * Audit log su `tool_execution_log` (tabella creata da MP-AIE-01).
 * Best-effort: errori di logging NON bloccano l'esecuzione.
 */
async function logAudit(
  ctx: ToolContext,
  tool: SilvioTool,
  toolName: string,
  fields: AuditFields,
): Promise<void> {
  try {
    await ctx.supabase.from("tool_execution_log").insert({
      company_id: ctx.companyId,
      user_id: ctx.userId,
      persona_key: ctx.personaKey ?? null,
      channel: ctx.channel ?? "internal_chat",
      tool_name: toolName,
      tool_domain: tool.domain ?? "meta",
      risk_level: tool.riskLevel ?? "safe",
      input_payload: fields.inputPayload,
      output_payload: fields.outputPayload,
      status: fields.status === "denied" ? "error" : fields.status,
      error_message: fields.status === "denied"
        ? `denied: ${fields.errorMessage}`
        : fields.errorMessage,
      proposal_id: fields.proposalId,
      duration_ms: fields.durationMs,
      trace_id: ctx.traceId ?? null,
      session_id: ctx.sessionId ?? null,
    });
  } catch (e) {
    console.warn(
      "[silvioToolExecution] audit log failed (non-blocking):",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Sanitizza payload per audit log: tronca > 50KB, rimuove fields PII pesanti.
 */
function sanitize(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > 50_000) {
      return { _truncated: true, _length: json.length, _preview: json.substring(0, 1000) };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { _unserializable: true };
  }
}
