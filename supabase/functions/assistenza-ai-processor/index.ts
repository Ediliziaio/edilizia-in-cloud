// MP03 — assistenza-ai-processor
// Ricevi messaggio assistenza (già persistito da handleAssistenza),
// risolvi contact + storia, fai 1-2 iter OpenAI con tool set 6,
// rispondi al cliente via whatsapp-send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { callOpenAI, type ChatMessage } from "../whatsapp-ai-processor/openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "../whatsapp-ai-processor/budget.ts";
import { logToolCall } from "../whatsapp-ai-processor/observability.ts";
import { SYSTEM_PROMPT_ASSISTENZA } from "./prompts/system_assistenza.ts";
import { TOOLS_ASSISTENZA, toOpenAISpec, findTool, type AssistenzaCtx } from "./tools/registry.ts";

interface Request {
  message_id?: string;
  contact_id: string;
  wa_number_id: string;
  routed_from?: string;
  phone?: string;
  content?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Request;
  try {
    body = await req.json() as Request;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.wa_number_id || !body.contact_id) {
    return json({ error: "missing_fields" }, 400);
  }

  // Load contact
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("id, company_id, nome, cognome, telefono, stato, tipo")
    .eq("id", body.contact_id)
    .maybeSingle();

  if (!contact) return json({ error: "contact_not_found" }, 404);

  // Load message se fornito
  let userContent: string | null = body.content ?? null;
  let phone: string = body.phone ?? contact.telefono ?? "";
  if (body.message_id) {
    const { data: msg } = await supabase
      .from("whatsapp_messages")
      .select("content_text, from_phone")
      .eq("id", body.message_id)
      .maybeSingle();
    if (msg) {
      userContent = userContent ?? msg.content_text;
      phone = phone || msg.from_phone;
    }
  }

  if (!userContent) return json({ error: "no_content" }, 400);

  // Budget
  const budget = await checkBudget(supabase, contact.company_id);
  if (!budget.ok) {
    await sendReply(body.wa_number_id, contact.company_id, phone, budget.user_message);
    return json({ ok: true, skipped: "budget" }, 200);
  }

  const ctx: AssistenzaCtx = {
    supabase,
    company_id: contact.company_id,
    contact_id: contact.id,
    contact: { nome: contact.nome, cognome: contact.cognome, stato: contact.stato, tipo: contact.tipo },
    phone,
    wa_number_id: body.wa_number_id,
    wa_message_id: body.message_id ?? null,
  };

  // Storia ultimi 6 turni
  const { data: history } = await supabase
    .from("whatsapp_messages")
    .select("direction, content_text")
    .eq("company_id", contact.company_id)
    .eq("from_phone", phone)
    .order("created_at", { ascending: false })
    .limit(6);

  const historyFormatted: ChatMessage[] = (history ?? [])
    .reverse()
    .filter((h) => h.content_text)
    .map((h) => ({
      role: h.direction === "inbound" ? "user" : "assistant",
      content: h.content_text ?? "",
    }));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_ASSISTENZA },
    ...historyFormatted,
    { role: "user", content: userContent },
  ];

  const model = budget.model_override ?? "gpt-4o";
  const openaiTools = toOpenAISpec(TOOLS_ASSISTENZA);
  const MAX_ITER = 2;
  const conv: ChatMessage[] = [...messages];
  let finalText: string | null = null;
  let tokIn = 0;
  let tokOut = 0;

  try {
    for (let i = 0; i < MAX_ITER; i++) {
      // MP05 — task_kind + company_id per routing via ai_model_config
      const resp = await callOpenAI({
        task_kind: "assistenza_clienti",
        company_id: contact.company_id,
        wa_message_id: body.message_id ?? null,
        model: budget.model_override ? model : undefined,
        messages: conv,
        tools: openaiTools,
        tool_choice: "auto",
        temperature: 0.4,
        max_tokens: 600,
      });
      tokIn += resp.usage?.prompt_tokens ?? 0;
      tokOut += resp.usage?.completion_tokens ?? 0;

      const assistantMsg = resp.choices[0].message;
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalText = assistantMsg.content ?? null;
        break;
      }

      const results = await Promise.all(
        assistantMsg.tool_calls.map(async (tc) => {
          const tool = findTool(tc.function.name);
          if (!tool) {
            return {
              tool_call_id: tc.id,
              result: { ok: false, error: "tool_not_found", user_message: "Non disponibile." },
            };
          }
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
          const t0 = Date.now();
          let result;
          try {
            result = await tool.handler(ctx, args);
          } catch (e) {
            result = { ok: false as const, error: String(e), user_message: "Errore interno." };
          }
          await logToolCall(supabase, {
            company_id: contact.company_id,
            wa_message_id: body.message_id ?? null,
            tool_name: tc.function.name,
            role_kind: "cliente",
            args,
            result,
            duration_ms: Date.now() - t0,
            model_used: model,
          });
          return { tool_call_id: tc.id, result };
        }),
      );

      conv.push(assistantMsg);
      for (const r of results) {
        conv.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          content: JSON.stringify(r.result),
        });
      }
    }

    if (!finalText) finalText = "Grazie per averci scritto. Il nostro team le risponderà a breve.";
    await sendReply(body.wa_number_id, contact.company_id, phone, finalText);

    const cost = estimateCostEur(model, tokIn, tokOut);
    await consumeBudget(supabase, contact.company_id, cost);

    return json({ ok: true, tokens_in: tokIn, tokens_out: tokOut }, 200);
  } catch (err) {
    // MP05-FIX — Credit-aware error handling
    if (err instanceof InsufficientCreditsError) {
      try {
        await sendReply(body.wa_number_id, contact.company_id, phone, err.user_message_it);
      } catch { /* silent */ }
      return json({ ok: false, reason: err.reason }, 402);
    }
    console.error(JSON.stringify({
      level: "error", fn: "assistenza-ai-processor",
      msg: "uncaught", error: String(err),
    }));
    try {
      await sendReply(body.wa_number_id, contact.company_id, phone,
        "Ho avuto un problema. Ti richiameremo a breve.");
    } catch { /* nada */ }
    return json({ error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendReply(
  waNumberId: string,
  companyId: string,
  to: string,
  text: string,
): Promise<void> {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to, text }),
  }).catch(() => {});
}
