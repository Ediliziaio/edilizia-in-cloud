/**
 * MP-CHAN-01 — Telegram Bot Processor
 *
 * Webhook entrypoint per il bot Telegram aziendale. Riusa il registry
 * centrale silvioTools.ts (channel='telegram') e il loop tool calling
 * pattern di silvio-chat / ai-orchestrator.
 *
 * Flow:
 *   1. Validate webhook secret (header x-telegram-bot-api-secret-token)
 *   2. Match bot_config + parse update
 *   3. Find/create telegram_user_mapping
 *   4. Onboarding /verify se non verificato
 *   5. Loop tool calling (max 4 iter) via aiRouterComplete + executeToolsParallel
 *   6. Send response Telegram via Bot API
 *   7. Log inbound + outbound in telegram_messages
 *
 * Configurazione webhook:
 *   curl https://api.telegram.org/bot<TOKEN>/setWebhook \
 *     -d "url=https://<project>.supabase.co/functions/v1/telegram-bot-processor" \
 *     -d "secret_token=<webhook_secret>"
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { getToolsForChannel, toolsToOpenAISpec } from "../_shared/silvioTools.ts";
import { executeToolsParallel } from "../_shared/silvioToolExecution.ts";

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;
const MAX_TOOL_ITERATIONS = 4;
const HISTORY_LIMIT = 10;

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  photo?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  voice?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document?: any;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback_query?: any;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Validate webhook secret
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secretHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Match bot via secret
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: botConfig } = await (supabase as any)
    .from("telegram_bot_configs")
    .select("*")
    .eq("webhook_secret", secretHeader)
    .eq("enabled", true)
    .maybeSingle();

  if (!botConfig) {
    return new Response("Bot not found or disabled", { status: 404 });
  }

  // Parse update
  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const message = update.message;
  if (!message?.from) {
    // Callback queries / edits non gestiti in v1
    return new Response("OK", { status: 200 });
  }

  const tgUserId = message.from.id;

  // Find/create mapping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: mapping } = await (supabase as any)
    .from("telegram_user_mappings")
    .select("*")
    .eq("bot_config_id", botConfig.id)
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  if (!mapping) {
    // Crea placeholder unverified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newMapping } = await (supabase as any)
      .from("telegram_user_mappings")
      .insert({
        bot_config_id: botConfig.id,
        telegram_user_id: tgUserId,
        telegram_username: message.from.username,
        telegram_first_name: message.from.first_name,
        telegram_last_name: message.from.last_name,
        company_id: botConfig.company_id,
        is_verified: false,
      })
      .select("*")
      .maybeSingle();
    mapping = newMapping;
    await sendTelegramMessage(
      botConfig.bot_token,
      message.chat.id,
      "Ciao! 👋 Per usare questo bot devi prima collegare il tuo account.\n\n" +
        "Vai su https://app.ediliziaincloud.it/impostazioni/telegram e copia il codice di verifica.\n" +
        "Poi torna qui e invia: `/verify <codice>`",
    );
    return new Response("OK", { status: 200 });
  }

  // Onboarding /verify
  if (!mapping.is_verified) {
    if (message.text?.startsWith("/verify ")) {
      const code = message.text.substring("/verify ".length).trim();
      const ok = await verifyCode(supabase, mapping.id, code);
      if (ok) {
        await sendTelegramMessage(
          botConfig.bot_token,
          message.chat.id,
          "✅ Account collegato! Ora puoi chattare con Silvio.\n" +
            "Esempi:\n• \"KPI aziendali\"\n• \"Cantieri attivi\"\n• \"Scadenze fatture\"",
        );
      } else {
        await sendTelegramMessage(
          botConfig.bot_token,
          message.chat.id,
          "❌ Codice non valido o scaduto. Genera un nuovo codice dal portale.",
        );
      }
      return new Response("OK", { status: 200 });
    }
    await sendTelegramMessage(
      botConfig.bot_token,
      message.chat.id,
      "Devi prima verificarti. Usa: `/verify <codice>` con il codice ricevuto sul portale.",
    );
    return new Response("OK", { status: 200 });
  }

  // Log inbound
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logRow } = await (supabase as any)
    .from("telegram_messages")
    .insert({
      bot_config_id: botConfig.id,
      mapping_id: mapping.id,
      direction: "inbound",
      telegram_message_id: message.message_id,
      message_type: message.text ? "text"
        : message.photo ? "photo"
        : message.voice ? "voice"
        : message.document ? "document"
        : "text",
      content: message.text ?? message.caption ?? "",
      processing_status: "processing",
    })
    .select("id")
    .maybeSingle();

  if (!message.text) {
    await sendTelegramMessage(
      botConfig.bot_token,
      message.chat.id,
      "Per ora gestisco solo messaggi di testo. Foto e audio prossimamente!",
    );
    return new Response("OK", { status: 200 });
  }

  // Comandi speciali
  if (message.text === "/start") {
    const companyName = await getCompanyName(supabase, mapping.company_id);
    await sendTelegramMessage(
      botConfig.bot_token,
      message.chat.id,
      `Ciao ${message.from.first_name ?? ""}! Sono Silvio, l'AI di ${companyName}.\n\n` +
        "Cosa vuoi fare oggi? Esempi:\n" +
        "• \"KPI aziendali\"\n• \"Cantieri attivi oggi\"\n• \"Scadenze fatture prossimi 7 giorni\"",
    );
    return new Response("OK", { status: 200 });
  }

  // ── AI processing con loop tool calling ──
  const userRole = await getUserRole(supabase, mapping.user_id);
  const personaKey = (mapping.active_persona_key as string) || botConfig.default_persona_key || "silvio";

  // Carica history (ultimi N messaggi)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: history } = await (supabase as any)
    .from("telegram_messages")
    .select("direction, content, ai_response")
    .eq("mapping_id", mapping.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reversedHistory: any[] = (history ?? []).slice().reverse();

  // Carica persona
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: persona } = await (supabase as any)
    .from("ai_personas")
    .select("system_prompt, kb_areas_filter, recommended_model")
    .eq("persona_key", personaKey)
    .maybeSingle();

  if (!persona) {
    await sendTelegramMessage(
      botConfig.bot_token,
      message.chat.id,
      "⚠️ Persona AI non configurata. Contatta l'amministratore.",
    );
    return new Response("OK", { status: 200 });
  }

  const availableTools = getToolsForChannel({
    channel: "telegram",
    role: userRole,
    personaKey,
  });
  const toolsSpec = availableTools.length > 0 ? toolsToOpenAISpec(availableTools) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: persona.system_prompt },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...reversedHistory.map((h: any) => ({
      role: h.direction === "inbound" ? "user" : "assistant",
      content: h.content || h.ai_response || "",
    })),
    { role: "user", content: message.text },
  ];

  // Show typing indicator
  await sendTelegramAction(botConfig.bot_token, message.chat.id, "typing");

  let iter = 0;
  let finalContent = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allToolCalls: any[] = [];
  let totalCost = 0;
  let lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null = null;

  try {
    while (iter < MAX_TOOL_ITERATIONS) {
      iter++;
      const idempotencyKey = `tg-${logRow?.id ?? message.message_id}-iter${iter}`;
      const aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        taskKey: `persona_${personaKey}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params: toolsSpec ? ({ temperature: 0.4, max_tokens: 2500, tools: toolsSpec, tool_choice: "auto" } as any) : { temperature: 0.4, max_tokens: 2500 },
        companyId: mapping.company_id,
        userId: mapping.user_id,
        personaKey,
        idempotencyKey,
        forceModel: persona.recommended_model ?? undefined,
      });
      lastResult = aiResult;
      totalCost += aiResult.costBilledEur ?? 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawChoice = (aiResult.rawResponse as any)?.choices?.[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tcs: any[] = rawChoice?.message?.tool_calls ?? [];

      if (tcs.length === 0) {
        finalContent = aiResult.content || "";
        break;
      }

      messages.push({
        role: "assistant",
        content: rawChoice?.message?.content ?? null,
        tool_calls: tcs,
      });
      allToolCalls.push(...tcs);

      const calls = tcs.map((tc) => {
        let parsedArgs: unknown = {};
        try { parsedArgs = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* keep {} */ }
        return { name: tc.function?.name as string, input: parsedArgs };
      });
      const results = await executeToolsParallel(calls, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        companyId: mapping.company_id,
        userId: mapping.user_id,
        primaryRole: userRole,
        personaKey,
        channel: "telegram",
        sessionId: mapping.active_session_id ?? undefined,
        kbAreasFilter: persona.kb_areas_filter,
      });

      results.forEach((r, idx) => {
        const tc = tcs[idx];
        const payload = r.success
          ? (r.proposalId ? { _proposal: true, proposalId: r.proposalId } : (r.data ?? null))
          : { error: r.error };
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(payload).slice(0, 8000),
        });
      });
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    finalContent = `⚠️ Errore: ${errMsg.slice(0, 200)}`;
  }

  if (!finalContent) {
    finalContent = "Non sono riuscito a completare la richiesta. Riformulala in modo più semplice.";
  }

  // Send response Telegram
  await sendTelegramMessage(botConfig.bot_token, message.chat.id, finalContent);

  // Update inbound + insert outbound log
  if (logRow?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("telegram_messages").update({
      processing_status: "processed",
      ai_response: finalContent,
      ai_tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
      ai_cost_billed_eur: totalCost,
      ai_persona_key: personaKey,
      processed_at: new Date().toISOString(),
    }).eq("id", logRow.id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("telegram_messages").insert({
    bot_config_id: botConfig.id,
    mapping_id: mapping.id,
    direction: "outbound",
    message_type: "text",
    content: finalContent,
    ai_persona_key: personaKey,
    ai_tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
    ai_cost_billed_eur: totalCost,
    processing_status: "processed",
    processed_at: new Date().toISOString(),
  });

  // Update mapping stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("telegram_user_mappings").update({
    total_messages_received: (mapping.total_messages_received ?? 0) + 1,
    total_messages_sent: (mapping.total_messages_sent ?? 0) + 1,
    last_message_at: new Date().toISOString(),
  }).eq("id", mapping.id);

  return new Response("OK", { status: 200 });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (e) {
    console.error("[telegram-bot-processor] sendMessage failed:",
      e instanceof Error ? e.message : String(e));
  }
}

async function sendTelegramAction(token: string, chatId: number, action: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API(token)}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch { /* non-blocking */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyCode(supabase: any, mappingId: string, code: string): Promise<boolean> {
  const { data } = await supabase
    .from("telegram_user_mappings")
    .select("verification_code, verification_expires_at, user_id")
    .eq("id", mappingId)
    .maybeSingle();

  if (!data || !data.verification_code) return false;
  if (data.verification_expires_at && new Date(data.verification_expires_at) < new Date()) return false;
  if (data.verification_code !== code) return false;

  await supabase.from("telegram_user_mappings").update({
    is_verified: true,
    verified_at: new Date().toISOString(),
    verification_code: null,
    verification_expires_at: null,
  }).eq("id", mappingId);

  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserRole(supabase: any, userId: string | null): Promise<string> {
  if (!userId) return "guest";
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? "company_staff";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCompanyName(supabase: any, companyId: string): Promise<string> {
  const { data } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "la tua azienda";
}
