/**
 * Edge Function: ai-orchestrator
 *
 * Entry point per chat con le 18 personas AI.
 *
 * Flow:
 *   1. Auth → user_id, company_id, role
 *   2. Parse request: { sessionId?, personaKey, message }
 *   3. RBAC check via can_user_use_persona()
 *      → se denied: log_rbac_violation + 403
 *   4. Carica persona (system_prompt, tier, recommended_model)
 *   5. Crea sessione se sessionId mancante
 *   6. Carica history (max 20 messages)
 *   7. Record user message
 *   8. Costruisci messages[] con system_prompt + history + user message
 *   9. Chiama aiRouterComplete (idempotency = `${sessionId}_${msgIdx}`)
 *  10. Record assistant message con ledger_id
 *  11. Ritorna { response, sessionId, ledgerId, costBilledEur }
 *
 * Body payload:
 *   {
 *     sessionId?: string,        // opzionale: se assente crea nuova sessione
 *     personaKey: string,        // es. "cfo", "pm_cantiere"
 *     message: string,           // testo utente
 *     historyLimit?: number      // default 20
 *   }
 *
 * Risposta success:
 *   {
 *     sessionId: string,
 *     messageId: string,
 *     response: string,          // testo assistant
 *     personaKey: string,
 *     modelUsed: string,
 *     tokensIn: number,
 *     tokensOut: number,
 *     costBilledEur: number,
 *     ledgerId?: string
 *   }
 *
 * Risposta error (RBAC denied):
 *   { error: "rbac_denied", reason: "...", message: "..." } 403
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete, type AiRouterMessage } from "../_shared/aiRouter.ts";
import { buildSystemPrompt } from "../_shared/preambolo.ts";
// MP-AIE-02 v2 — tool calling loop unificato col registry centrale silvioTools.ts
import { getToolsForChannel, toolsToOpenAISpec } from "../_shared/silvioTools.ts";
import { executeToolsParallel, type ToolExecutionResult } from "../_shared/silvioToolExecution.ts";

const MAX_TOOL_ITERATIONS = 5;

interface OrchestratorPayload {
  sessionId?: string;
  personaKey: string;
  message: string;
  historyLimit?: number;
}

interface PersonaRow {
  persona_key: string;
  display_name: string;
  system_prompt: string;
  recommended_tier_key: string;
  recommended_model: string | null;
  enabled: boolean;
  is_system: boolean;
  // Track 1 Cervello Supremo
  kb_areas_filter: string[] | null;
  system_prompt_version: number | null;
}

interface HistoryRow {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: unknown;
  tool_call_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCompanyAndRole(supabaseAdmin: any, userId: string): Promise<{
  companyId: string | null;
  primaryRole: string | null;
}> {
  // company_id da profiles
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  // ruolo primario da user_roles (priorita': super_admin > company_admin > altri)
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleList: string[] = (roles ?? []).map((r: any) => r.role);
  const priority = ["super_admin", "company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor", "worker"];
  const primaryRole = priority.find(p => roleList.includes(p)) ?? roleList[0] ?? null;

  return {
    companyId: profile?.company_id ?? null,
    primaryRole,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPersona(supabaseAdmin: any, personaKey: string): Promise<PersonaRow | null> {
  const { data, error } = await supabaseAdmin
    .from("ai_personas")
    .select("persona_key, display_name, system_prompt, recommended_tier_key, recommended_model, enabled, is_system, kb_areas_filter, system_prompt_version")
    .eq("persona_key", personaKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as PersonaRow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHistory(supabaseAdmin: any, sessionId: string, limit: number): Promise<HistoryRow[]> {
  // Carica ultimi N messaggi in ordine cronologico
  const { data, error } = await supabaseAdmin
    .from("ai_persona_messages")
    .select("role, content, tool_calls, tool_call_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as HistoryRow[]).reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    // 1) Auth
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    // 2) Body
    const body = (await req.json()) as OrchestratorPayload;
    const personaKey = body?.personaKey?.trim();
    const userMessage = body?.message?.trim();
    const historyLimit = Math.min(Math.max(body?.historyLimit ?? 20, 1), 50);

    if (!personaKey) return errorResponse("personaKey mancante", 400, corsHeaders);
    if (!userMessage) return errorResponse("message mancante", 400, corsHeaders);
    if (userMessage.length > 8000) return errorResponse("message troppo lungo (max 8000 char)", 400, corsHeaders);

    // 3) Resolve company + role
    const { companyId, primaryRole } = await getCompanyAndRole(supabaseAdmin, userId);
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    // 4) RBAC check
    const { data: rbacResult, error: rbacErr } = await supabaseAdmin.rpc("can_user_use_persona", {
      p_user_id: userId,
      p_persona_key: personaKey,
    });

    if (rbacErr) {
      console.error("[ai-orchestrator] RBAC RPC error:", rbacErr);
      return errorResponse("Errore verifica permessi", 500, corsHeaders);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rbac = rbacResult as any;
    if (!rbac?.allowed) {
      // Log violation + alert owner (asincrono)
      await supabaseAdmin.rpc("log_rbac_violation", {
        p_company_id: companyId,
        p_user_id: userId,
        p_attempted_persona: personaKey,
        p_user_role: primaryRole,
        p_attempted_message: userMessage,
        p_reason: rbac?.reason ?? "unknown",
        p_client_ip: req.headers.get("x-forwarded-for") ?? null,
        p_user_agent: req.headers.get("user-agent") ?? null,
      });

      return jsonResponse({
        error: "rbac_denied",
        reason: rbac?.reason,
        message: "Non hai le autorizzazioni per accedere a questa area. L'incidente è stato registrato.",
      }, 403, corsHeaders);
    }

    // 5) Load persona
    const persona = await loadPersona(supabaseAdmin, personaKey);
    if (!persona) return errorResponse("Persona non trovata", 404, corsHeaders);
    if (!persona.enabled) return errorResponse("Persona disabilitata", 403, corsHeaders);

    // 6) Crea sessione se sessionId mancante
    let sessionId = body.sessionId;
    if (!sessionId) {
      const { data: newSession, error: createErr } = await supabaseAdmin
        .from("ai_persona_sessions")
        .insert({
          user_id: userId,
          company_id: companyId,
          persona_key: personaKey,
          title: userMessage.slice(0, 60) || "Nuova conversazione",
        })
        .select("id")
        .single();
      if (createErr) {
        console.error("[ai-orchestrator] create_persona_session error:", createErr);
        return errorResponse(`Errore creazione sessione: ${createErr.message}`, 500, corsHeaders);
      }
      sessionId = newSession.id as string;
    } else {
      // Verifica che la sessione esista e appartenga all'utente
      const { data: existingSession, error: sessErr } = await supabaseAdmin
        .from("ai_persona_sessions")
        .select("id, user_id, company_id, persona_key")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessErr || !existingSession) return errorResponse("Sessione non trovata", 404, corsHeaders);
      if (existingSession.user_id !== userId) return errorResponse("Sessione non autorizzata", 403, corsHeaders);
      if (existingSession.company_id !== companyId) return errorResponse("Sessione fuori tenant", 403, corsHeaders);
      if (existingSession.persona_key !== personaKey) {
        return errorResponse("Persona non corrisponde alla sessione", 400, corsHeaders);
      }
    }

    // 7) Load history
    const history = await loadHistory(supabaseAdmin, sessionId!, historyLimit);

    // 8) Record user message
    const { data: userMessageId, error: userMessageErr } = await supabaseAdmin.rpc("record_persona_message", {
      p_session_id: sessionId,
      p_role: "user",
      p_content: userMessage,
    });
    if (userMessageErr) {
      console.error("[ai-orchestrator] record user message error:", userMessageErr);
      return errorResponse(`Errore salvataggio messaggio: ${userMessageErr.message}`, 500, corsHeaders);
    }

    // 9) Build messages for OpenRouter
    // Track 1 Cervello Supremo: antepone preambolo costituzionale al system_prompt persona
    // Cache 60s nel loader → zero latency dopo prima chiamata
    // Graceful degradation: se preambolo non caricabile, usa solo persona prompt
    const { prompt: systemPromptComplete, preamboloVersion } = await buildSystemPrompt(
      supabaseAdmin,
      persona.system_prompt,
    );
    if (!preamboloVersion) {
      console.warn(`[ai-orchestrator] preambolo NON applicato per persona ${persona.persona_key}`);
    }

    // MP-AIE-02 v2: filtra i tool del registry centrale per channel + persona + role
    const availableTools = getToolsForChannel({
      channel: "web_persona",
      role: primaryRole ?? "company_staff",
      personaKey,
    });
    const toolsSpec = availableTools.length > 0 ? toolsToOpenAISpec(availableTools) : undefined;

    const messages: AiRouterMessage[] = [
      { role: "system", content: systemPromptComplete },
      ...history.map(h => ({
        role: h.role,
        content: h.content,
        ...(h.tool_call_id ? { tool_call_id: h.tool_call_id } : {}),
      })),
      { role: "user", content: userMessage },
    ];

    // 10) MP-AIE-02 v2 — Loop tool calling (parità con silvio-chat)
    const taskKey = `persona_${personaKey}`;
    let iteration = 0;
    let finalContent = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allToolCalls: any[] = [];
    const toolCallsLog: Array<{ name: string; args: unknown; result_preview: string }> = [];
    let lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null = null;
    let totalCostBilled = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      const idempotencyKey = `persona_${sessionId}_${userMessageId ?? "msg"}_iter${iteration}`;

      let aiResult;
      try {
        aiResult = await aiRouterComplete({
          supabase: supabaseAdmin,
          taskKey,
          messages,

          params: toolsSpec
            ? ({ temperature: 0.4, max_tokens: 4000, tools: toolsSpec, tool_choice: "auto" } as any)
            : { temperature: 0.4, max_tokens: 4000 },
          companyId,
          userId,
          personaKey,
          idempotencyKey,
          forceModel: persona.recommended_model ?? undefined,
        });
        lastResult = aiResult;
        totalCostBilled += aiResult.costBilledEur ?? 0;
        totalTokensIn += aiResult.promptTokens ?? 0;
        totalTokensOut += aiResult.completionTokens ?? 0;
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error("[ai-orchestrator] aiRouter iter", iteration, "error:", errMsg);
        await supabaseAdmin.rpc("record_persona_message", {
          p_session_id: sessionId,
          p_role: "assistant",
          p_content: `⚠️ Mi dispiace, c'è stato un problema: ${errMsg.slice(0, 200)}`,
          p_tool_calls: null,
          p_tool_call_id: null,
          p_ledger_id: null,
          p_tokens_in: null,
          p_tokens_out: null,
          p_cost_billed_eur: null,
          p_model_used: null,
          p_metadata: { error: true, error_message: errMsg.slice(0, 500) },
        });
        return errorResponse(errMsg, 500, corsHeaders);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawChoice = (aiResult.rawResponse as any)?.choices?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls: any[] = rawChoice?.message?.tool_calls ?? [];

      if (toolCalls.length === 0) {
        finalContent = aiResult.content || "";
        break;
      }

      // L'LLM vuole eseguire tool: aggiungi assistant message con tool_calls
      messages.push({
        role: "assistant",
        content: rawChoice?.message?.content ?? null,

        tool_calls: toolCalls,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      allToolCalls.push(...toolCalls);

      // Esegui tool in parallelo via registry centrale
      const calls = toolCalls.map((tc) => {
        let parsedArgs: unknown = {};
        try { parsedArgs = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* keep {} */ }
        return { name: tc.function?.name as string, input: parsedArgs };
      });
      const results: ToolExecutionResult[] = await executeToolsParallel(calls, {
        supabase: supabaseAdmin,
        companyId,
        userId,
        primaryRole: primaryRole ?? "company_staff",
        personaKey,
        channel: "web_persona",
        sessionId,
        kbAreasFilter: persona.kb_areas_filter,
      });

      results.forEach((r, idx) => {
        const tc = toolCalls[idx];
        const payload = r.success
          ? (r.proposalId
            ? { _proposal: true, proposalId: r.proposalId }
            : (r.data ?? null))
          : { error: r.error };
        const serialized = JSON.stringify(payload).slice(0, 8000);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: serialized,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        toolCallsLog.push({
          name: r.toolName,
          args: calls[idx].input,
          result_preview: serialized.slice(0, 200),
        });
      });
      // continua loop
    }

    if (!finalContent && iteration >= MAX_TOOL_ITERATIONS) {
      finalContent = "⚠️ Mi scuso, la richiesta è troppo complessa. Puoi riformularla in più passaggi?";
    }

    // 11) Record assistant message with ledger link + tool calls log
    const { data: msgId, error: msgErr } = await supabaseAdmin.rpc("record_persona_message", {
      p_session_id: sessionId,
      p_role: "assistant",
      p_content: finalContent,
      p_tool_calls: toolCallsLog.length > 0
        ? toolCallsLog.map((t) => ({ name: t.name, args: t.args }))
        : null,
      p_tool_call_id: null,
      p_ledger_id: lastResult?.ledgerId ?? null,
      p_tokens_in: totalTokensIn,
      p_tokens_out: totalTokensOut,
      p_cost_billed_eur: totalCostBilled,
      p_model_used: lastResult?.modelUsed ?? null,
      p_metadata: {
        iterations: iteration,
        used_primary: lastResult?.usedPrimary,
        fallback_index: lastResult?.fallbackIndex,
        duration_ms: lastResult?.durationMs,
        tools_invoked: toolCallsLog.map((t) => t.name),
      },
    });
    if (msgErr) console.error("[ai-orchestrator] record_persona_message error:", msgErr);

    // 12) Response (back-compat: stessi campi della v1 + tool_calls + iterations)
    return jsonResponse({
      sessionId,
      messageId: msgId,
      response: finalContent,
      personaKey,
      personaDisplayName: persona.display_name,
      modelUsed: lastResult?.modelUsed,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costBilledEur: totalCostBilled,
      marginEur: lastResult?.marginEur,
      ledgerId: lastResult?.ledgerId,
      durationMs: lastResult?.durationMs,
      iterations: iteration,
      toolCalls: toolCallsLog,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-orchestrator] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
