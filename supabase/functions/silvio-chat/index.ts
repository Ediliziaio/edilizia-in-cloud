/**
 * Edge Function: silvio-chat
 *
 * Bridge Internal Chat (Chat Team) ↔ Silvio (meta-persona orchestrator AI).
 * Supporta TOOL CALLING: Silvio invoca tool RPC su dati reali aziendali
 * (commesse, fatture, cashflow, preventivi, clienti) via OpenRouter
 * function-calling capability.
 *
 * Flow:
 *   1. Auth → user_id, company_id
 *   2. Verifica channel silvio-ai + membership + RBAC
 *   3. Carica Silvio system_prompt + ruolo utente
 *   4. Costruisci messages: system + history + user
 *   5. Loop tool-calling (max 4 iterazioni):
 *      a. Chiama OpenRouter con tools[]
 *      b. Se LLM ritorna tool_calls → esegui server-side
 *      c. Aggiungi tool messages e ricallia LLM
 *      d. Se LLM ritorna content finale → esci dal loop
 *   6. Posta risposta finale in internal_chat_messages
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { aiRouterComplete, type AiRouterMessage } from "../_shared/aiRouter.ts";
import { SILVIO_TOOLS, getToolsForRole, executeTool, type ToolContext } from "../_shared/silvioTools.ts";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const PERSONA_KEY = "silvio";
const MAX_HISTORY = 12;
const MAX_TOOL_ITERATIONS = 4;

interface ChatPayload {
  channel_id: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    const body = (await req.json()) as ChatPayload;
    const channelId = body?.channel_id?.trim();
    const userMessage = body?.message?.trim();

    if (!channelId) return errorResponse("channel_id mancante", 400, corsHeaders);
    if (!userMessage) return errorResponse("message mancante", 400, corsHeaders);
    if (userMessage.length > 8000) return errorResponse("message troppo lungo (max 8000 char)", 400, corsHeaders);

    // ── 1) Verifica channel + membership ────────────────────────────────
    const { data: channel } = await supabaseAdmin
      .from("internal_chat_channels")
      .select("id, name, company_id, dm_user_ids")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel) return errorResponse("Canale non trovato", 404, corsHeaders);
    if (channel.name !== "silvio-ai") return errorResponse("Canale non è Silvio", 400, corsHeaders);

    const companyId: string = channel.company_id;

    const { data: membership } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) return errorResponse("Utente non membro del canale", 403, corsHeaders);

    // ── 2) Persona Silvio ───────────────────────────────────────────────
    const { data: persona } = await supabaseAdmin
      .from("ai_personas")
      .select("system_prompt, recommended_tier_key, recommended_model, enabled")
      .eq("persona_key", PERSONA_KEY)
      .maybeSingle();

    if (!persona) return errorResponse("Silvio non configurato", 500, corsHeaders);
    if (!persona.enabled) return errorResponse("Silvio temporaneamente disabilitato", 503, corsHeaders);

    // ── 3) RBAC check ───────────────────────────────────────────────────
    const { data: rbacResult } = await supabaseAdmin.rpc("can_user_use_persona", {
      p_user_id: userId,
      p_persona_key: PERSONA_KEY,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rbac = rbacResult as any;
    if (!rbac?.allowed) {
      await supabaseAdmin.rpc("log_rbac_violation", {
        p_company_id: companyId,
        p_user_id: userId,
        p_attempted_persona: PERSONA_KEY,
        p_user_role: null,
        p_attempted_message: userMessage,
        p_reason: rbac?.reason ?? "unknown",
        p_client_ip: req.headers.get("x-forwarded-for") ?? null,
        p_user_agent: req.headers.get("user-agent") ?? null,
      });
      await supabaseAdmin.from("internal_chat_messages").insert({
        channel_id: channelId, sender_id: SILVIO_SENDER_ID, company_id: companyId,
        content: "🚫 Mi dispiace, non posso accedere a queste informazioni per il tuo ruolo.",
        message_type: "text",
      });
      return jsonResponse({ ok: false, error: "rbac_denied" }, 200, corsHeaders);
    }

    // ── 4) Profile + role ───────────────────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("first_name, last_name, email")
      .eq("id", userId).maybeSingle();
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleList: string[] = (userRoles ?? []).map((r: any) => r.role);
    const rolePriority = ["super_admin", "company_admin", "salesperson", "call_center", "company_staff", "employee", "subcontractor", "worker"];
    const primaryRole = rolePriority.find((p) => roleList.includes(p)) ?? roleList[0] ?? "company_staff";
    const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Utente";

    const roleScopeMap: Record<string, string> = {
      super_admin: "Accesso completo a tutto.",
      company_admin: "Titolare/amministratore — può chiedere QUALSIASI cosa: finanza, cantieri, vendite, personale, legale, strategia.",
      company_staff: "Impiegato di staff — accesso a operations e amministrazione di base. Ha accesso a get_overdue_payments e get_revenue_forecast (gestione crediti). NO finanza globale (saldo banca, EBITDA).",
      salesperson: "Venditore — accesso a clienti/preventivi. NO finanza globale, NO HR di altri.",
      call_center: "Operatore call-center — accesso a info cliente in linea + FAQ. NO finanza, NO HR.",
      employee: "Dipendente — info proprie (presenze, ferie). NO altri dipendenti, NO finanza globale.",
      worker: "Operaio — info SUO cantiere assegnato. NO finanza, NO HR di altri, NO commerciale.",
      subcontractor: "Subappaltatore esterno — solo dati propri lavori. NO altre commesse, NO finanza, NO HR.",
    };
    const userScope = roleScopeMap[primaryRole] ?? "Accesso limitato — chiedi conferma per dati sensibili.";

    // ── 5) System prompt arricchito con contesto utente + tool guidance ─
    const userContextPrompt = [
      "",
      "# CONTESTO UTENTE CORRENTE (CRITICO per RBAC e personalizzazione)",
      `- Nome: ${userName}`,
      `- Ruolo: ${primaryRole}`,
      `- Perimetro: ${userScope}`,
      "",
      "# REGOLE DUE-DILIGENCE NEI DATI",
      "1. PRIMA di rispondere a domande SU DATI AZIENDALI (commesse, fatture, cashflow, clienti, ecc), DEVI invocare il tool appropriato. NON inventare numeri.",
      "2. Se un tool ritorna un errore o dati vuoti, dillo esplicitamente.",
      "3. Se la domanda è cross-area (es. 'posso assumere?'), invoca PIÙ tool e sintetizza.",
      "4. Se il dato richiesto NON è coperto dai tool, dillo: 'Per questa info devi consultare [area]'.",
      "5. Riporta SEMPRE i numeri reali dai tool, non arrotondamenti vaghi.",
      "6. Cita sempre la fonte (es. 'in base alle 41 commesse attive registrate').",
      "",
      "# REGOLA FORMATO",
      "- Numeri sempre formato italiano: € 1.234,56",
      "- Date sempre dd/mm/yyyy",
      "- Risposte concise (max 250 parole) salvo richiesta esplicita di approfondimento",
    ].join("\n");

    // ── 4.ter) Carica memoria long-term: facts azienda + sintesi recenti utente
    let memoryContextPrompt = "";
    try {
      const { data: memCtx } = await supabaseAdmin.rpc("silvio_get_memory_context", {
        p_company_id: companyId,
        p_user_id: userId,
        p_max_summaries: 3,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = memCtx as any;
      const facts = (ctx?.facts ?? []) as Array<{ key: string; value: unknown; confidence: number }>;
      const summaries = (ctx?.recent_summaries ?? []) as Array<{ period: { start: string; end: string }; summary: string; topics?: string[] }>;

      if (facts.length > 0 || summaries.length > 0) {
        const lines: string[] = ["", "# MEMORIA LONG-TERM (uso interno, non mostrare all'utente direttamente)"];
        if (facts.length > 0) {
          lines.push("## Fatti aziendali noti");
          for (const f of facts.slice(0, 20)) {
            lines.push(`- ${f.key}: ${JSON.stringify(f.value)} (confidence ${(f.confidence ?? 0).toFixed(2)})`);
          }
        }
        if (summaries.length > 0) {
          lines.push("## Conversazioni recenti con questo utente");
          for (const s of summaries) {
            lines.push(`- [${s.period.end}] ${s.summary}${s.topics?.length ? ` (topics: ${s.topics.join(", ")})` : ""}`);
          }
        }
        lines.push("");
        lines.push("REGOLA: usa questa memoria per CONTESTUALIZZARE le risposte. Es. se l'utente dice 'la solita banca' e sai che è Intesa, rispondi con quella. Se l'utente ricorda una decisione passata, conferma. NON dire mai 'come dicevamo' se non c'è coerenza con summaries.");
        memoryContextPrompt = lines.join("\n");
      }
    } catch (e) {
      console.warn("[silvio-chat] memory context fetch failed:", e);
    }

    const enrichedSystemPrompt = persona.system_prompt + userContextPrompt + memoryContextPrompt;

    // ── 6) Carica history (ultimi 12 msg dalla chat) ────────────────────
    const { data: historyRaw } = await supabaseAdmin
      .from("internal_chat_messages")
      .select("sender_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history: Array<{ sender_id: string; content: string }> = (historyRaw ?? []).reverse() as any;

    // ── 7) Ottieni tool disponibili per il ruolo ────────────────────────
    const allowedTools = getToolsForRole(primaryRole);
    const toolSchemas = allowedTools.map(t => t.schema);

    const toolCtx: ToolContext = {
      supabase: supabaseAdmin,
      companyId,
      userId,
      primaryRole,
    };

    // ── 8) Costruisci messages iniziali ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "system", content: enrichedSystemPrompt },
      ...history.map((m) => ({
        role: m.sender_id === SILVIO_SENDER_ID ? "assistant" : "user",
        content: m.content,
      })),
    ];

    // Aggiungi user message se non già presente come ultimo
    if (history.length === 0 || history[history.length - 1]?.content !== userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    // ── 9) Tool-calling loop ────────────────────────────────────────────
    const idempotencyBase = `silvio_${channelId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let finalContent = "";
    let lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null = null;
    let iteration = 0;
    const toolCallsLog: Array<{ name: string; args: unknown; result_preview: string }> = [];

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      const idempotencyKey = `${idempotencyBase}_iter${iteration}`;

      let result;
      try {
        result = await aiRouterComplete({
          supabase: supabaseAdmin,
          taskKey: "persona_silvio",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          params: {
            temperature: 0.3,
            max_tokens: 2500,
            tools: toolSchemas,
            tool_choice: "auto",
          },
          companyId,
          userId,
          personaKey: PERSONA_KEY,
          idempotencyKey,
          forceModel: persona.recommended_model ?? undefined,
        });
        lastResult = result;
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error("[silvio-chat] aiRouter iter", iteration, "error:", errMsg);
        await supabaseAdmin.from("internal_chat_messages").insert({
          channel_id: channelId, sender_id: SILVIO_SENDER_ID, company_id: companyId,
          content: `⚠️ C'è stato un problema tecnico: ${errMsg.slice(0, 300)}`,
          message_type: "text",
        });
        return jsonResponse({ ok: false, error: errMsg }, 200, corsHeaders);
      }

      // Inspect raw response to extract tool_calls
      const rawChoice = result.rawResponse?.choices?.[0];
      const toolCalls = rawChoice?.message?.tool_calls ?? [];

      if (toolCalls.length > 0) {
        // L'LLM vuole chiamare uno o più tool
        // Aggiungi assistant message con tool_calls a messages[]
        messages.push({
          role: "assistant",
          content: rawChoice.message.content ?? null,
          tool_calls: toolCalls,
        });

        // Esegui ogni tool e aggiungi tool message
        for (const tc of toolCalls) {
          const toolName = tc.function?.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(tc.function?.arguments ?? "{}");
          } catch {
            toolArgs = {};
          }

          const toolResult = await executeTool(toolName, toolArgs, toolCtx);
          const resultStr = JSON.stringify(toolResult).slice(0, 8000);

          toolCallsLog.push({
            name: toolName,
            args: toolArgs,
            result_preview: resultStr.slice(0, 200),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultStr,
          });
        }

        // Continue loop: re-invoke LLM with tool results
        continue;
      }

      // No more tool_calls — final answer
      finalContent = result.content || "";
      break;
    }

    if (!finalContent && iteration >= MAX_TOOL_ITERATIONS) {
      finalContent = "⚠️ Non sono riuscito a completare l'analisi. Riformula la domanda in modo più specifico.";
    }

    // ── 10) Salva risposta nella chat ───────────────────────────────────
    const { data: insertedMsg } = await supabaseAdmin
      .from("internal_chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: SILVIO_SENDER_ID,
        company_id: companyId,
        content: finalContent,
        message_type: "text",
      })
      .select()
      .single();

    return jsonResponse({
      ok: true,
      reply: finalContent,
      message_id: insertedMsg?.id,
      iterations: iteration,
      tool_calls: toolCallsLog,
      model_used: lastResult?.modelUsed,
      tokens_in: lastResult?.promptTokens,
      tokens_out: lastResult?.completionTokens,
      cost_billed_eur: lastResult?.costBilledEur,
      ledger_id: lastResult?.ledgerId,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-chat] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
