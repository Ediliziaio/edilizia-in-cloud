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
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete, type AiRouterMessage } from "../_shared/aiRouter.ts";

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
    .select("persona_key, display_name, system_prompt, recommended_tier_key, recommended_model, enabled, is_system")
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
      const { data: newSessionId, error: createErr } = await supabaseAdmin.rpc("create_persona_session", {
        p_persona_key: personaKey,
        p_title: userMessage.slice(0, 60),
        p_user_id: userId,
        p_company_id: companyId,
      });
      if (createErr) {
        console.error("[ai-orchestrator] create_persona_session error:", createErr);
        return errorResponse(`Errore creazione sessione: ${createErr.message}`, 500, corsHeaders);
      }
      sessionId = newSessionId as string;
    } else {
      // Verifica che la sessione esista e appartenga all'utente
      const { data: existingSession, error: sessErr } = await supabaseAdmin
        .from("ai_persona_sessions")
        .select("id, user_id, persona_key")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessErr || !existingSession) return errorResponse("Sessione non trovata", 404, corsHeaders);
      if (existingSession.user_id !== userId) return errorResponse("Sessione non autorizzata", 403, corsHeaders);
      if (existingSession.persona_key !== personaKey) {
        return errorResponse("Persona non corrisponde alla sessione", 400, corsHeaders);
      }
    }

    // 7) Load history
    const history = await loadHistory(supabaseAdmin, sessionId!, historyLimit);

    // 8) Record user message
    await supabaseAdmin.rpc("record_persona_message", {
      p_session_id: sessionId,
      p_role: "user",
      p_content: userMessage,
    });

    // 9) Build messages for OpenRouter
    const messages: AiRouterMessage[] = [
      { role: "system", content: persona.system_prompt },
      ...history.map(h => ({
        role: h.role,
        content: h.content,
        ...(h.tool_call_id ? { tool_call_id: h.tool_call_id } : {}),
      })),
      { role: "user", content: userMessage },
    ];

    // 10) Call AI Router (auto-charges + logs ledger)
    // task_key dinamico per persona: "persona_<key>" → fallback a config default
    const taskKey = `persona_${personaKey}`;
    const idempotencyKey = `${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        supabase: supabaseAdmin,
        taskKey,
        messages,
        params: { temperature: 0.4, max_tokens: 4000 },
        companyId,
        userId,
        personaKey,
        idempotencyKey,
        forceModel: persona.recommended_model ?? undefined,
      });
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error("[ai-orchestrator] aiRouter error:", errMsg);

      // Record error message in chat (così l'utente sa che c'è stato un problema)
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

    // 11) Record assistant message with ledger link
    const { data: msgId, error: msgErr } = await supabaseAdmin.rpc("record_persona_message", {
      p_session_id: sessionId,
      p_role: "assistant",
      p_content: aiResult.content,
      p_tool_calls: null,
      p_tool_call_id: null,
      p_ledger_id: aiResult.ledgerId ?? null,
      p_tokens_in: aiResult.promptTokens,
      p_tokens_out: aiResult.completionTokens,
      p_cost_billed_eur: aiResult.costBilledEur,
      p_model_used: aiResult.modelUsed,
      p_metadata: {
        used_primary: aiResult.usedPrimary,
        fallback_index: aiResult.fallbackIndex,
        duration_ms: aiResult.durationMs,
      },
    });
    if (msgErr) console.error("[ai-orchestrator] record_persona_message error:", msgErr);

    // 12) Response
    return jsonResponse({
      sessionId,
      messageId: msgId,
      response: aiResult.content,
      personaKey,
      personaDisplayName: persona.display_name,
      modelUsed: aiResult.modelUsed,
      tokensIn: aiResult.promptTokens,
      tokensOut: aiResult.completionTokens,
      costBilledEur: aiResult.costBilledEur,
      marginEur: aiResult.marginEur,
      ledgerId: aiResult.ledgerId,
      durationMs: aiResult.durationMs,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-orchestrator] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
