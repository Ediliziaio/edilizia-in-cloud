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

const SYSTEM_PROMPT_BASE = `Sei Silvio Superadmin, il co-founder AI di Florin Andriciuc — fondatore di Edilizia in Cloud (gestionale cloud per imprese edili italiane).

NON sei l'assistente che parla con i clienti finali: tu parli SOLO con Florin e il team super_admin.
Sei dentro l'area /admin del sistema. Hai accesso cross-tenant alle metriche aggregate della piattaforma SaaS.

═══════════════════════════════════════════════════════════════════════════
🛡 5 GUARDRAIL DI SCOPE — REGOLE DURE INVIOLABILI
═══════════════════════════════════════════════════════════════════════════

1. **AUTH HARD-CHECK**: Il sistema verifica già che tu sia super_admin. Non fare auth-check tu.

2. **SCOPE = SAAS PLATFORM**: parli SOLO di metriche/operazioni della piattaforma SaaS.
   - ✅ MRR, churn, lead, ticket aperti, anomalie, forecast aggregati
   - ❌ Operatività di UNA singola azienda cliente (cantieri, preventivi, fatture, operai)

3. **REFUSAL OUT-OF-SCOPE**: se Florin chiede gestione operativa di una azienda cliente
   (es. "crea preventivo per Mario", "stato cantiere X", "fattura cliente Y"), RIFIUTA con:
   _"Questa è una domanda da fare a Silvio nell'area azienda — io vedo solo dati piattaforma.
   Vai su /azienda/chat (canale silvio-ai) per chiedere a Silvio cliente."_

4. **NO DATI PERSONALI FOUNDER**: se Florin chiede info personali (stipendio, salute, banca personale),
   RIFIUTA con: _"Non gestisco dati personali — chiedi al tuo commercialista o consulente."_

5. **GDPR ON CLIENT DATA**: quando parli di una specifica azienda cliente, MAI esporre PII
   (telefono/email/CF di singoli dipendenti). Aggregato OK, individuale NO.
   Su decisioni che impattano clienti (es. mass email): SEMPRE disclaimer GDPR.

═══════════════════════════════════════════════════════════════════════════
🎭 LE TUE 15 PERSONAS — adotta il tono giusto per la query
═══════════════════════════════════════════════════════════════════════════

Sei un router universale che adotta il TONO della persona più adatta al topic.
Le 15 personas (con ambito): vedi system prompt addendum iniettato runtime.

Persona-driven response:
- Se la query tocca UNA area (es. solo MRR) → adotta tono di quella persona (es. CFO)
- Se la query tocca PIÙ aree → sintetizzi come Strategic Advisor con viste multiple
  ("Da CFO: ... · Da Sales: ... · Sintesi: ...")
- Se non matcha NESSUNA area scope → o è out-of-scope (refusal) o è generica (default tono)

═══════════════════════════════════════════════════════════════════════════
🧠 PERSONALITÀ BASE
═══════════════════════════════════════════════════════════════════════════

- Diretto, founder-to-founder, vocabolario operativo (no "ehm", "forse", "mi dispiace molto")
- Proattivo: se vedi un problema, lo dici PRIMA che venga chiesto
- Numerico: ogni risposta importante ha numeri, non aggettivi
- Italiano corretto, registro professionale ma confidenziale (Florin → tu)
- Quando suggerisci un'azione, dai SEMPRE 1 prossimo passo concreto, non un papiro

═══════════════════════════════════════════════════════════════════════════
🛠 REGOLE TOOL-USE
═══════════════════════════════════════════════════════════════════════════

- Non agire mai su decisioni che spostano denaro o cancellano dati senza conferma esplicita
- Se non sei sicuro di un dato, dillo. MAI inventare numeri
- Quando usi un tool, dichiaralo: "Sto leggendo MRR..."

TOOL DISPONIBILI:
Area REVENUE (5):
1. get_mrr_breakdown(period) — MRR/ARR/ARPU + nuovi MRR
2. get_unpaid_customers(limit) — aziende con pagamento fallito
3. get_revenue_forecast(months_ahead) — proiezione MRR
4. get_ai_costs_summary(period) — costo AI OpenRouter
5. get_top_customers_by_revenue(limit) — top N aziende

Area SUPPORT (4):
6. list_tickets({status, priority, limit}) — ticket aperti per priorità
7. draft_ticket_reply(ticket_id, tone) — bozza risposta empatic/technical/apologetic
8. get_customer_history(customer_id) — tutto su un cliente (ticket + interazioni)
9. cluster_tickets(period) — pattern ricorrenti

Area LEAD (4):
10. list_leads({score_min, days_since_contact, status}) — lead caldi non contattati
11. get_lead_detail(lead_id) — scheda lead completa
12. create_task(title, due_date, related_to) — promemoria follow-up
13. draft_followup_email(lead_id, tone) — bozza email personalizzata

USA i tool ogni volta che ti chiedono dati specifici. NON inventare numeri.

═══════════════════════════════════════════════════════════════════════════
⏰ AZIONI OUTBOUND (Sprint 3)
═══════════════════════════════════════════════════════════════════════════

In V1 base prepari SOLO bozze. Quando Florin dice "manda" o "crea workflow":
risponde "Sprint 3 in costruzione — per ora preparo la bozza, l'invio reale arriva presto."`;

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

  // ─── AREA SUPPORT (4 tool) ─────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_tickets",
      description: "Lista ticket di supporto aperti, filtrabile per status/priorità. Cross-tenant aggregata.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "pending", "resolved", "closed", "all"], description: "Status filter (default open+pending)" },
          priority: { type: "string", enum: ["low", "normal", "high", "critical", "all"], description: "Priority filter" },
          limit: { type: "integer", minimum: 1, maximum: 50, description: "Max risultati (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_ticket_reply",
      description: "Genera bozza di risposta per un ticket (NON la invia, solo bozza per Florin)",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "string", description: "UUID del ticket" },
          tone: { type: "string", enum: ["empathetic", "technical", "apologetic", "concise"], description: "Tono della risposta" },
        },
        required: ["ticket_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_history",
      description: "Storico interazioni di un cliente specifico (azienda): ticket, log azioni admin, ultimo accesso",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string", description: "UUID dell'azienda cliente" },
          days: { type: "integer", minimum: 7, maximum: 365, description: "Periodo storico (default 90gg)" },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cluster_tickets",
      description: "Pattern ricorrenti nei ticket del periodo — keyword cluster per individuare bug/feature ricorrenti",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["7d", "30d", "90d"], description: "Periodo analisi (default 30d)" },
          min_cluster_size: { type: "integer", minimum: 2, maximum: 20, description: "Min ticket per cluster (default 3)" },
        },
      },
    },
  },

  // ─── AREA LEAD (4 tool) ────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_leads",
      description: "Lista lead caldi/non contattati. Filtri: score min, giorni dall'ultimo contatto, status.",
      parameters: {
        type: "object",
        properties: {
          score_min: { type: "integer", minimum: 0, maximum: 100, description: "Score minimo (default 60)" },
          days_since_contact: { type: "integer", minimum: 0, maximum: 90, description: "Giorni dall'ultimo contatto (default 0)" },
          status: { type: "string", enum: ["new", "qualified", "contacted", "won", "lost", "all"], description: "Status filter" },
          limit: { type: "integer", minimum: 1, maximum: 50, description: "Max (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead_detail",
      description: "Scheda lead completa: dati, score, source, interazioni, eventi tracking",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID del lead" },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Crea promemoria/task interno (es. richiamare lead). NON manda email.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titolo del task" },
          due_date: { type: "string", description: "Data ISO (es. 2026-05-15T10:00:00Z)" },
          related_to: { type: "string", description: "UUID entità correlata (lead/customer/ticket)" },
          related_type: { type: "string", enum: ["lead", "customer", "ticket", "company"], description: "Tipo entità correlata" },
          notes: { type: "string", description: "Note opzionali" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_followup_email",
      description: "Genera bozza email di follow-up personalizzata per un lead (NON la invia, solo bozza)",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID del lead" },
          tone: { type: "string", enum: ["warm", "professional", "urgent", "casual"], description: "Tono email" },
          context_hint: { type: "string", description: "Contesto opzionale (es. 'lead ha visto pagina fatturazione SDI 3 volte')" },
        },
        required: ["lead_id"],
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
    // Revenue (Sprint 1)
    get_mrr_breakdown:           { rpc: "silvio_get_mrr_breakdown",           argMap: (a) => ({ p_period: a.period ?? "30d" }) },
    get_unpaid_customers:        { rpc: "silvio_get_unpaid_customers",        argMap: (a) => ({ p_limit: a.limit ?? 20 }) },
    get_revenue_forecast:        { rpc: "silvio_get_revenue_forecast",        argMap: (a) => ({ p_months_ahead: a.months_ahead ?? 3 }) },
    get_ai_costs_summary:        { rpc: "silvio_get_ai_costs_summary",        argMap: (a) => ({ p_period: a.period ?? "30d" }) },
    get_top_customers_by_revenue:{ rpc: "silvio_get_top_customers_by_revenue",argMap: (a) => ({ p_limit: a.limit ?? 10 }) },
    // Support (Sprint 2)
    list_tickets:                { rpc: "silvio_list_tickets",                argMap: (a) => ({ p_status: a.status ?? "open", p_priority: a.priority ?? "all", p_limit: a.limit ?? 20 }) },
    draft_ticket_reply:          { rpc: "silvio_draft_ticket_reply",          argMap: (a) => ({ p_ticket_id: a.ticket_id, p_tone: a.tone ?? "empathetic" }) },
    get_customer_history:        { rpc: "silvio_get_customer_history",        argMap: (a) => ({ p_company_id: a.company_id, p_days: a.days ?? 90 }) },
    cluster_tickets:             { rpc: "silvio_cluster_tickets",             argMap: (a) => ({ p_period: a.period ?? "30d", p_min_cluster: a.min_cluster_size ?? 3 }) },
    // Lead (Sprint 2)
    list_leads:                  { rpc: "silvio_list_leads",                  argMap: (a) => ({ p_score_min: a.score_min ?? 60, p_days_since_contact: a.days_since_contact ?? 0, p_status: a.status ?? "all", p_limit: a.limit ?? 20 }) },
    get_lead_detail:             { rpc: "silvio_get_lead_detail",             argMap: (a) => ({ p_lead_id: a.lead_id }) },
    create_task:                 { rpc: "silvio_create_task",                 argMap: (a) => ({ p_title: a.title, p_due_date: a.due_date ?? null, p_related_to: a.related_to ?? null, p_related_type: a.related_type ?? null, p_notes: a.notes ?? null }) },
    draft_followup_email:        { rpc: "silvio_draft_followup_email",        argMap: (a) => ({ p_lead_id: a.lead_id, p_tone: a.tone ?? "professional", p_context_hint: a.context_hint ?? null }) },
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

    // 5. ROUTING PERSONAS — chiama pick_silvio_admin_persona per scegliere il
    //    tono. Se 1 persona → mono-area. Se 2-3 → multi-area sintesi.
    let personaAddendum = "";
    let activePersonas: string[] = [];
    try {
      const { data: personas, error: personaErr } = await supabase.rpc(
        "pick_silvio_admin_persona",
        { p_query: message }
      );
      if (!personaErr && Array.isArray(personas) && personas.length > 0) {
        activePersonas = personas.map((p: { persona_key: string }) => p.persona_key);
        const top = personas[0] as { display_name: string; emoji: string; system_prompt_addendum: string };
        if (personas.length === 1) {
          personaAddendum = `\n\n═══ PERSONA ATTIVA: ${top.emoji} ${top.display_name} ═══\n${top.system_prompt_addendum}`;
        } else {
          // Multi-area: sintesi
          const personasList = personas.map((p: { display_name: string; emoji: string; system_prompt_addendum: string }) =>
            `\n• ${p.emoji} ${p.display_name}: ${p.system_prompt_addendum.slice(0, 200)}...`
          ).join("");
          personaAddendum = `\n\n═══ MULTI-AREA — SINTETIZZA QUESTE VISTE ═══${personasList}\n\nFormato risposta multi-area:\n"Da [Persona A]: ... · Da [Persona B]: ... · **Sintesi**: ..."`;
        }
      } else {
        // No match → potenziale out-of-scope. L'AI base capirà se rifiutare.
        personaAddendum = "\n\n═══ NO PERSONA MATCH ═══\nLa query non matcha nessun ambito specifico. Valuta se è out-of-scope (rifiuta) o generica (rispondi con tono base).";
      }
    } catch (e) {
      console.warn("[silvio-admin-chat] persona routing failed:", e);
    }

    // 5b. Build messages[]
    const aiMessages: AIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT_BASE + personaAddendum },
    ];
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

    // 8. Persist assistant (con personas attive + tool calls per audit/learning)
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
        active_personas: activePersonas,
        tool_calls_made: toolCallsMade.length,
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
