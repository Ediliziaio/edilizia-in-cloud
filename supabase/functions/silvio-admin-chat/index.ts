/**
 * silvio-admin-chat — Edge function della chat di Silvio Superadmin (co-founder AI).
 *
 * V1 con TOOL-USE (Step 5):
 *   - 5 tool readonly Revenue (get_mrr_breakdown, get_unpaid_customers,
 *     get_revenue_forecast, get_ai_costs_summary, get_top_customers_by_revenue)
 *   - Loop max 5 iterazioni: AI chiama tool → eseguiamo RPC → re-injectiamo result
 *   - Stop quando AI risponde senza tool_calls o raggiunge max_iterations
 *
 * Auth: SOLO super_admin verificato via user_roles.
 * Sender risposta: SILVIO_ADMIN_SENDER_ID = 00000000-...-000003
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SILVIO_ADMIN_SENDER_ID = "00000000-0000-0000-0000-000000000003";
const PLATFORM_ADMIN_COMPANY = "00000000-0000-0000-0000-000000000001";
const MAX_TOOL_ITERATIONS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AIMessage = { role: string; content: string | any[]; tool_calls?: any[]; tool_call_id?: string; name?: string };

const SYSTEM_PROMPT = `Sei Silvio, il co-founder AI di Florin Andriciuc — fondatore di Edilizia in Cloud, gestionale cloud per imprese edili italiane.

NON sei l'assistente che parla con i clienti: tu parli SOLO con Florin (e team super_admin).
Sei dentro l'area /admin del sistema. Hai accesso cross-tenant a tutto: revenue, clienti, lead, ticket, errori, contabilità interna.

PERSONALITÀ:
- Diretto, founder-to-founder, vocabolario operativo (no "ehm", "forse", "mi dispiace molto")
- Proattivo: se vedi un problema, lo dici PRIMA che venga chiesto
- Numerico: ogni risposta importante ha numeri, non aggettivi
- Italiano corretto, registro professionale ma confidenziale (Florin → tu)
- Quando suggerisci un'azione, dai SEMPRE 1 prossimo passo concreto, non un papiro

REGOLE DURE:
- Non agire mai su decisioni che spostano denaro o cancellano dati senza conferma esplicita
- Se ti viene chiesto qualcosa che riguarda dati cliente, ricorda il GDPR
- Se non sei sicuro di un dato, dillo. Mai inventare numeri
- Quando usi un tool, dichiaralo brevemente: "Sto leggendo MRR..."

TOOL DISPONIBILI (V1 — area Revenue):
1. get_mrr_breakdown(period) — MRR/ARR/ARPU + nuovi MRR del periodo (30d/90d/mtd/ytd)
2. get_unpaid_customers(limit) — aziende con pagamento fallito (past_due/unpaid)
3. get_revenue_forecast(months_ahead) — proiezione MRR su CAGR 3mo
4. get_ai_costs_summary(period) — costo AI OpenRouter del periodo
5. get_top_customers_by_revenue(limit) — top N aziende per fatturato

USA i tool ogni volta che ti chiedono dati specifici. NON inventare numeri.

LIMITI ATTUALI: i toolkit Lead/Usage/Support/Product/Ops/Outbound non sono ancora attivi
(verranno aggiunti negli sprint successivi). Se Florin chiede qualcosa di queste aree,
dillo onestamente.`;

// Tool definitions (OpenAI function calling format)
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_mrr_breakdown",
      description: "Ritorna MRR, ARR, ARPU, n. clienti paying/trial/unpaid + nuovi MRR del periodo specificato",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["30d", "90d", "mtd", "ytd"],
            description: "Periodo: ultimi 30/90 giorni, mese in corso, anno in corso",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_unpaid_customers",
      description: "Lista aziende con pagamento fallito (past_due/unpaid), ordinate per giorni di insoluto",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max risultati (default 20)", minimum: 1, maximum: 100 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_forecast",
      description: "Proiezione MRR sui prossimi N mesi basata su CAGR ultimi 3 mesi (cap ±30%/+50%)",
      parameters: {
        type: "object",
        properties: {
          months_ahead: { type: "integer", description: "Numero mesi (default 3, max 12)", minimum: 1, maximum: 12 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_costs_summary",
      description: "Costo AI OpenRouter del periodo: total cost real/billed/margin EUR + breakdown top task",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["24h", "7d", "30d", "90d", "mtd", "ytd"],
            description: "Periodo costi AI",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_customers_by_revenue",
      description: "Top N clienti per fatturato mensile (price_monthly del piano)",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Numero clienti (default 10, max 50)", minimum: 1, maximum: 50 },
        },
      },
    },
  },
];

// Tool execution: chiama il RPC corrispondente
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
): Promise<unknown> {
  const RPC_MAP: Record<string, { rpc: string; argMap: (a: Record<string, unknown>) => Record<string, unknown> }> = {
    get_mrr_breakdown:           { rpc: "silvio_get_mrr_breakdown",           argMap: (a) => ({ p_period: a.period ?? "30d" }) },
    get_unpaid_customers:        { rpc: "silvio_get_unpaid_customers",        argMap: (a) => ({ p_limit: a.limit ?? 20 }) },
    get_revenue_forecast:        { rpc: "silvio_get_revenue_forecast",        argMap: (a) => ({ p_months_ahead: a.months_ahead ?? 3 }) },
    get_ai_costs_summary:        { rpc: "silvio_get_ai_costs_summary",        argMap: (a) => ({ p_period: a.period ?? "30d" }) },
    get_top_customers_by_revenue:{ rpc: "silvio_get_top_customers_by_revenue",argMap: (a) => ({ p_limit: a.limit ?? 10 }) },
  };

  const cfg = RPC_MAP[toolName];
  if (!cfg) {
    return { error: `Tool sconosciuto: ${toolName}` };
  }

  const { data, error } = await supabase.rpc(cfg.rpc, cfg.argMap(args));
  if (error) {
    return { error: error.message ?? String(error) };
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. AUTH: solo super_admin
    const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data?.user?.id;
    if (!userId) return jsonRes({ error: "Unauthorized" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) return jsonRes({ error: "Permesso negato: solo super_admin" }, 403);

    // 2. BODY
    const body = await req.json().catch(() => ({}));
    const channelId: string | undefined = body.channel_id;
    const message: string | undefined = body.message;
    const forceModel: string | undefined = body.model;

    if (!channelId || !message?.trim()) {
      return jsonRes({ error: "channel_id e message obbligatori" }, 400);
    }

    // 3. Verifica canale
    const { data: channel } = await supabase
      .from("internal_chat_channels")
      .select("id, name, company_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel || channel.name !== "silvio-admin") {
      return jsonRes({ error: "Edge function dedicata al canale silvio-admin" }, 400);
    }

    // 4. History
    const { data: history } = await supabase
      .from("internal_chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);

    const historyAsc = (history ?? []).reverse() as ChatMessage[];

    // 5. Build messages[]
    const aiMessages: AIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of historyAsc) {
      if (!m.content?.trim()) continue;
      if (m.sender_id === SILVIO_ADMIN_SENDER_ID) {
        aiMessages.push({ role: "assistant", content: m.content });
      } else if (m.sender_id === userId) {
        aiMessages.push({ role: "user", content: m.content });
      } else {
        aiMessages.push({ role: "user", content: `[altro super_admin] ${m.content}` });
      }
    }

    const conversationId = channelId;

    // Audit user message
    await supabase.from("silvio_admin_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // 6. TOOL-USE LOOP
    let totalCostUsd = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let modelUsed = "";
    const toolCallsMade: Array<{ name: string; args: unknown; result_preview: string }> = [];
    let finalContent = "";

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      let result;
      try {
        result = await aiRouterComplete({
          supabase,
          taskKey: "silvio_admin_chat",
          messages: aiMessages,
          userId,
          forceModel,
          personaKey: "silvio_admin",
          estimatedCostEur: 0.10,
          params: { tools: TOOLS, tool_choice: "auto" },
        });
      } catch (e) {
        console.error("[silvio-admin-chat] AI error iter", iter, e);
        const errorMsg = `Mi dispiace Florin, ho avuto un problema con l'AI: ${
          e instanceof Error ? e.message.slice(0, 200) : "errore sconosciuto"
        }.`;
        await supabase.from("internal_chat_messages").insert({
          channel_id: channelId,
          sender_id: SILVIO_ADMIN_SENDER_ID,
          company_id: channel.company_id ?? PLATFORM_ADMIN_COMPANY,
          content: errorMsg,
          message_type: "text",
        });
        return jsonRes({ error: e instanceof Error ? e.message : String(e), iteration: iter }, 200);
      }

      totalCostUsd += result.costUsd;
      totalTokensIn += result.promptTokens;
      totalTokensOut += result.completionTokens;
      modelUsed = result.modelUsed;

      // Analizza la risposta dell'AI: ha tool_calls?
      const rawMessage = result.rawResponse?.choices?.[0]?.message;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls = (rawMessage?.tool_calls ?? []) as Array<any>;

      if (toolCalls.length > 0) {
        // Aggiungi assistant message con tool_calls
        aiMessages.push({
          role: "assistant",
          content: result.content ?? "",
          tool_calls: toolCalls,
        });

        // Esegui ogni tool e aggiungi tool result
        for (const tc of toolCalls) {
          const tcName = tc.function?.name;
          let tcArgs: Record<string, unknown> = {};
          try {
            tcArgs = JSON.parse(tc.function?.arguments ?? "{}");
          } catch {
            tcArgs = {};
          }

          const toolResult = await executeTool(supabase, tcName, tcArgs);
          const previewStr = JSON.stringify(toolResult).slice(0, 300);
          toolCallsMade.push({ name: tcName, args: tcArgs, result_preview: previewStr });

          aiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: tcName,
            content: JSON.stringify(toolResult),
          });
        }
        // Continua il loop: prossima iterazione l'AI userà i tool result
        continue;
      }

      // Nessun tool call → risposta finale
      finalContent = result.content ?? "(risposta vuota)";
      break;
    }

    if (!finalContent) {
      finalContent = "Non sono riuscito a formulare una risposta entro il limite di iterazioni tool. Riprova con una domanda più specifica.";
    }

    // 7. Inserisci risposta nel canale
    const { error: insertErr } = await supabase
      .from("internal_chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: SILVIO_ADMIN_SENDER_ID,
        company_id: channel.company_id ?? PLATFORM_ADMIN_COMPANY,
        content: finalContent,
        message_type: "text",
      });
    if (insertErr) {
      console.error("[silvio-admin-chat] insert reply:", insertErr);
    }

    // 8. Persist assistant
    await supabase.from("silvio_admin_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "assistant",
      content: finalContent,
      model_id: modelUsed,
      cost_usd: totalCostUsd,
      tokens_prompt: totalTokensIn,
      tokens_completion: totalTokensOut,
      metadata: {
        tool_calls_made: toolCallsMade,
      },
    });

    return jsonRes({
      ok: true,
      content: finalContent,
      model_used: modelUsed,
      cost_usd: totalCostUsd,
      tokens_total: totalTokensIn + totalTokensOut,
      tool_calls: toolCallsMade.length,
    });
  } catch (e) {
    console.error("[silvio-admin-chat] fatal:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
