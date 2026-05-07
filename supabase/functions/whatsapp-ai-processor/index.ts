// MP02 — whatsapp-ai-processor refactored con tool-calling + loop agentico.
// Sostituisce la pipeline a switch-case (941 righe pre-MP02).
//
// Flusso per ogni messaggio:
//   1. Load message + lock processing_status=processing
//   2. Identity via whatsapp-identity-router
//   3. Budget check (soft → gpt-4o-mini, hard → skip)
//   4. Media handling (audio → transcribe, image → analyze)
//   5. Build history (ultimi 10 turni)
//   6. Loop agentico max 3 iter: OpenAI + tool calls paralleli
//   7. Invio risposta via whatsapp-send
//   8. Consume budget + mark processed

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import {
  filterToolsByGrants,
  findTool,
  toOpenAISpec,
} from "./tools/registry.ts";
import { SYSTEM_PROMPT_OPERAIO } from "./prompts/system_operaio.ts";
import { SYSTEM_PROMPT_TITOLARE } from "./prompts/system_titolare.ts";
import { STR } from "./prompts/strings.ts";
import { resolveIdentity } from "./identity.ts";
import { analyzeImage, transcribeAudio } from "./media.ts";
import { callOpenAI, type ChatMessage } from "./openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "./budget.ts";
import { logToolCall } from "./observability.ts";
import type { ToolCtx } from "./tools/shared/types.ts";

const OPENAI_MODEL_DEFAULT = Deno.env.get("OPENAI_MODEL_DEFAULT") ?? "gpt-4o";
const MAX_ITERATIONS = 3;
const MAX_TOOL_CALLS_PER_TURN = readEnvInt(
  "WA_AI_MAX_TOOL_CALLS_PER_TURN",
  4,
  1,
  12,
);

interface ProcessRequest {
  message_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: ProcessRequest;
  try {
    body = (await req.json()) as ProcessRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.message_id) {
    return json({ error: "missing_message_id" }, 400);
  }

  const { data: msg, error: msgErr } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, company_id, wa_number_id, wa_message_id, from_phone, to_phone, message_type, content_text, media_url, media_storage_path, processing_status, metadata, created_at",
    )
    .eq("id", body.message_id)
    .maybeSingle();

  if (msgErr || !msg) {
    return json({ error: "message_not_found" }, 404);
  }

  if (
    msg.processing_status &&
    !["received", "processing"].includes(msg.processing_status)
  ) {
    return json(
      { skip: "already_processed", status: msg.processing_status },
      200,
    );
  }

  // Lock ottimistico
  await supabase
    .from("whatsapp_messages")
    .update({ processing_status: "processing" })
    .eq("id", body.message_id)
    .eq("processing_status", "received");

  try {
    // Identity (inline, no inter-function fetch)
    const identity = await resolveIdentity(
      supabase,
      msg.from_phone,
      msg.company_id,
    );
    if (!identity.matched) {
      await sendReply(msg, STR.operaio.unknown_user);
      return markDone(supabase, body.message_id, "processed");
    }

    // Budget
    const budget = await checkBudget(supabase, msg.company_id);
    if (!budget.ok) {
      await sendReply(msg, budget.user_message);
      return markDone(supabase, body.message_id, "failed", "budget_exceeded");
    }

    // Media handling
    let userContent = msg.content_text ?? "";
    if (msg.message_type === "audio" && msg.media_storage_path) {
      try {
        const transcript = await transcribeAudio(
          supabase,
          msg.media_storage_path,
        );
        userContent = `[Audio trascritto]: ${transcript}`;
      } catch (e) {
        console.error(
          JSON.stringify({
            level: "error",
            fn: "transcribe",
            error: String(e),
          }),
        );
        userContent = "[Audio non trascrivibile]";
      }
    } else if (msg.message_type === "image" && msg.media_url) {
      try {
        const hint = /ddt/i.test(userContent) ? "ddt" : "generic";
        const analysis = await analyzeImage(
          msg.media_url,
          hint as "ddt" | "generic",
        );
        userContent =
          `[Immagine — analisi]: ${analysis}\n\nTesto dell'utente: ${
            msg.content_text ?? "(nessuno)"
          }`;
      } catch (e) {
        console.error(
          JSON.stringify({ level: "error", fn: "analyze", error: String(e) }),
        );
        userContent = "[Immagine — analisi non disponibile]";
      }
    }

    // History: ultimi 10 turni
    const { data: history } = await supabase
      .from("whatsapp_messages")
      .select("direction, content_text, created_at")
      .eq("company_id", msg.company_id)
      .eq("from_phone", msg.from_phone)
      .lt("created_at", msg.created_at ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    const historyFormatted: ChatMessage[] = (history ?? [])
      .reverse()
      .filter((h) => h.content_text && h.content_text.trim().length > 0)
      .map((h) => ({
        role: h.direction === "inbound" ? "user" : "assistant",
        content: h.content_text ?? "",
      }));

    const systemPrompt =
      identity.kind === "titolare" || identity.kind === "admin"
        ? SYSTEM_PROMPT_TITOLARE
        : SYSTEM_PROMPT_OPERAIO;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyFormatted,
      { role: "user", content: userContent },
    ];

    // Tool filter per role
    const availableTools = filterToolsByGrants(identity.role_grants);
    const openaiTools = toOpenAISpec(availableTools);

    // Session
    let sessionId: string | null = null;
    const { data: existingSess } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("phone_number", msg.from_phone)
      .eq("company_id", msg.company_id)
      .maybeSingle();
    if (existingSess) {
      sessionId = existingSess.id;
      await supabase
        .from("whatsapp_sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", sessionId);
    } else if (identity.user_id) {
      const { data: newSess } = await supabase
        .from("whatsapp_sessions")
        .insert({
          company_id: msg.company_id,
          phone_number: msg.from_phone,
          operaio_id: identity.user_id,
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      sessionId = newSess?.id ?? null;
    }

    const toolCtx: ToolCtx = {
      supabase,
      company_id: msg.company_id,
      user_id: identity.user_id,
      employee_id: identity.employee_id,
      phone: msg.from_phone,
      role_grants: identity.role_grants,
      locale: identity.locale,
      waNumberId: msg.wa_number_id ?? "",
      sessionId,
      kind: identity.kind,
    };

    const model = budget.model_override ?? OPENAI_MODEL_DEFAULT;
    // MP05 — routing per task_kind. Titolare/admin → modello premium per
    // ragionamento/tool calling complesso. Operaio/default → modello economico
    // (deepseek/haiku) configurato in ai_model_config.
    const taskKind = identity.kind === "titolare" || identity.kind === "admin"
      ? ("bot_operativo_titolare" as const)
      : ("bot_operativo_operaio" as const);
    const conv: ChatMessage[] = [...messages];
    let finalText: string | null = null;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const resp = await callOpenAI({
        model: budget.model_override ? model : undefined,
        task_kind: taskKind,
        company_id: msg.company_id,
        wa_message_id: msg.id,
        messages: conv,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: openaiTools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
        max_tokens: 800,
      });

      totalTokensIn += resp.usage?.prompt_tokens ?? 0;
      totalTokensOut += resp.usage?.completion_tokens ?? 0;

      const choice = resp.choices[0];
      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalText = assistantMsg.content ?? STR.shared.generic_error;
        break;
      }

      // Esegui tool con guardrail: ogni tool call riceve comunque una risposta,
      // ma non permettiamo a un singolo messaggio di saturare DB/API.
      const toolCalls = assistantMsg.tool_calls;
      const executableToolCalls = toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
      const skippedToolCalls = toolCalls.slice(MAX_TOOL_CALLS_PER_TURN);
      const results = [
        ...(await Promise.all(
          executableToolCalls.map(async (tc) => {
            const tool = findTool(tc.function.name);
            if (!tool) {
              return {
                tool_call_id: tc.id,
                result: {
                  ok: false,
                  error: "tool_not_found",
                  user_message: STR.shared.tool_unavailable,
                },
              };
            }
            // Re-check grants
            const hasGrants = tool.requires_grants.every((g) =>
              identity.role_grants.includes(g)
            );
            if (!hasGrants) {
              return {
                tool_call_id: tc.id,
                result: {
                  ok: false,
                  error: "forbidden",
                  user_message: STR.shared.tool_unavailable,
                },
              };
            }

            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              return {
                tool_call_id: tc.id,
                result: {
                  ok: false,
                  error: "invalid_args",
                  user_message: STR.shared.generic_error,
                },
              };
            }

            const t0 = Date.now();
            let result;
            try {
              result = await tool.handler(toolCtx, args);
            } catch (e) {
              result = {
                ok: false as const,
                error: String(e),
                user_message: STR.shared.generic_error,
              };
            }
            const dur = Date.now() - t0;

            await logToolCall(supabase, {
              company_id: msg.company_id,
              wa_message_id: msg.id,
              tool_name: tc.function.name,
              role_kind: identity.kind,
              args,
              result,
              duration_ms: dur,
              model_used: model,
            });

            return { tool_call_id: tc.id, result };
          }),
        )),
        ...skippedToolCalls.map((tc) => ({
          tool_call_id: tc.id,
          result: {
            ok: false,
            error: "tool_batch_limited",
            user_message: STR.shared.tool_unavailable,
          },
        })),
      ];

      conv.push(assistantMsg);
      for (const r of results) {
        conv.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          content: JSON.stringify(r.result),
        });
      }
    }

    if (!finalText) finalText = STR.operaio.max_iterations;

    await sendReply(msg, finalText);

    const costEur = estimateCostEur(model, totalTokensIn, totalTokensOut);
    await consumeBudget(supabase, msg.company_id, costEur);

    return markDone(supabase, body.message_id, "processed");
  } catch (err) {
    // MP05-FIX — Gestione crediti insufficienti: messaggio user-friendly
    // senza rivelare modello o costo reale (F1-F3).
    if (err instanceof InsufficientCreditsError) {
      try {
        await sendReply(msg, err.user_message_it);
      } catch {
        // silent fail
      }
      return markDone(
        supabase,
        body.message_id,
        "failed",
        `credits_${err.reason}`,
      );
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        fn: "whatsapp-ai-processor",
        msg: "uncaught",
        message_id: body.message_id,
        error: errorMsg,
      }),
    );
    try {
      await sendReply(msg, STR.shared.generic_error);
    } catch {
      // nada
    }
    return markDone(supabase, body.message_id, "failed", errorMsg);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), min), max);
}

async function markDone(
  supabase: SupabaseClient,
  id: string,
  status: "processed" | "failed" = "processed",
  error?: string,
): Promise<Response> {
  await supabase
    .from("whatsapp_messages")
    .update({
      processing_status: status,
      processing_error: error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  return json({ ok: true, status }, 200);
}

interface MsgForSend {
  wa_number_id: string | null;
  from_phone: string;
  company_id: string;
}

async function sendReply(msg: MsgForSend, text: string): Promise<void> {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        wa_number_id: msg.wa_number_id,
        company_id: msg.company_id,
        to: msg.from_phone,
        text,
      }),
    });
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", fn: "sendReply", error: String(e) }),
    );
  }
}
