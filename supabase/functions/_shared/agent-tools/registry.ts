/**
 * MP-AIE-01 — Tool Registry centrale
 *
 * Registry esplicito (no dynamic import) di TUTTI i tool disponibili.
 * Riusabile da: ai-orchestrator, whatsapp-ai-processor, internal-agent-tools.
 *
 * Ogni nuovo tool va aggiunto a `ALL_TOOLS` e (opzionalmente) re-exported
 * dal proprio domain barrel.
 */

import type { ToolContext, ToolDefinition, ToolResult } from "./types.ts";
import { isToolAllowed } from "./permissions.ts";
import { createActionProposal, logToolExecution } from "./audit.ts";

// ── DOMAIN: cantiere (esempio scaffolding; tool reali verranno migrati da
//    whatsapp-ai-processor in una pull request separata) ─────────────────
import { GET_CANTIERE_STATUS } from "./domains/cantiere/get_cantiere_status.ts";
import { ELENCA_CANTIERI_OGGI } from "./domains/cantiere/elenca_cantieri_oggi.ts";

// ── DOMAIN: crm ─────────────────────────────────────────────────────────
import { GET_CLIENT_INFO } from "./domains/crm/get_client_info.ts";
import { LIST_RECENT_CLIENTS } from "./domains/crm/list_recent_clients.ts";

// ── DOMAIN: fattura ─────────────────────────────────────────────────────
import { LISTA_SCADENZE } from "./domains/fattura/lista_scadenze.ts";

// (Più tool verranno aggiunti in step successivi: vedi MP file in masterprompts/)

const ALL_TOOLS: ToolDefinition[] = [
  GET_CANTIERE_STATUS,
  ELENCA_CANTIERI_OGGI,
  GET_CLIENT_INFO,
  LIST_RECENT_CLIENTS,
  LISTA_SCADENZE,
];

/** Ritorna l'array completo dei tool registrati. */
export function getAllTools(): ToolDefinition[] {
  return ALL_TOOLS;
}

/** Ricerca un tool per name (esatto). */
export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export { filterToolsByGrants, isToolAllowed } from "./permissions.ts";

/**
 * Converte una lista di tool in OpenAI function-calling spec, compatibile
 * con il body `params.tools` di aiRouterComplete.
 */
export function toOpenAISpec(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Esegue un tool (con dispatcher RBAC + risk-based routing).
 *
 * Rules:
 *   - tool 'safe'   → esegue subito + log success
 *   - tool 'yellow' → crea action_proposal (NO esecuzione handler) + log proposed
 *   - tool 'red'    → crea action_proposal con risk='red' (HITL forte) + log proposed
 *
 * Permission denied → ritorna { success: false, error: forbidden } senza log
 * (lascia l'audit a chi ha chiamato il tool con i parametri di accesso).
 */
export async function executeTool(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(toolName);
  if (!tool) {
    return {
      success: false,
      error: { code: "tool_not_found", message: `Tool ${toolName} non trovato nel registry` },
    };
  }

  if (!isToolAllowed(tool, ctx)) {
    return {
      success: false,
      error: {
        code: "forbidden",
        message: `Non autorizzato a usare ${toolName} con ruolo "${ctx.userRole}"${
          ctx.personaKey ? ` o persona "${ctx.personaKey}"` : ""
        }.`,
      },
    };
  }

  const t0 = Date.now();
  try {
    if (tool.riskLevel === "red" || tool.riskLevel === "yellow") {
      const proposalId = await createActionProposal(ctx, tool, input);
      await logToolExecution(ctx, tool, input, null, "proposed", null, proposalId || null, Date.now() - t0);
      return { success: true, proposalId: proposalId || undefined };
    }

    const data = await tool.handler(input, ctx);
    await logToolExecution(ctx, tool, input, data, "success", null, null, Date.now() - t0);
    return { success: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logToolExecution(ctx, tool, input, null, "error", message, null, Date.now() - t0);
    return { success: false, error: { code: "execution_failed", message } };
  }
}
