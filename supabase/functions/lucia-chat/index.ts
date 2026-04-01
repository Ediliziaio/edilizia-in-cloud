/**
 * lucia-chat — Motore AI di Lucia per Edilizia in Cloud
 *
 * Riceve un messaggio utente dal canale #lucia-ai e risponde tramite Claude API
 * con memory, RBAC e tool_use per leggere/scrivere dati aziendali.
 *
 * POST body:
 *   { message: string, user_id: string, company_id: string,
 *     channel_id: string, user_permissions: Record<string,boolean> }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-4-5";
const MAX_MEMORY_MESSAGES = 20;

// ─── Tool definitions ─────────────────────────────────────────────────────────
const LUCIA_TOOLS = [
  {
    name: "get_orders",
    description: "Recupera ordini/cantieri dell'azienda con filtri opzionali. Richiede permesso canViewOrders.",
    input_schema: {
      type: "object",
      properties: {
        stato: { type: "string", description: "Filtra per stato: bozza, confermato, in_lavorazione, completato, annullato" },
        cliente_nome: { type: "string", description: "Cerca per nome cliente (parziale)" },
        limit: { type: "number", description: "Numero massimo di risultati (default 10, max 50)" },
      },
    },
  },
  {
    name: "get_order_detail",
    description: "Dettaglio completo di un singolo ordine/cantiere inclusi items e note. Richiede permesso canViewOrders.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "UUID dell'ordine" },
      },
      required: ["order_id"],
    },
  },
  {
    name: "get_customers",
    description: "Lista clienti dell'azienda con filtri. Richiede permesso canViewCustomers.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Cerca per nome (parziale)" },
        limit: { type: "number", description: "Numero massimo risultati (default 10)" },
      },
    },
  },
  {
    name: "get_tasks",
    description: "Lista attività/task con filtri. Richiede permesso canViewPersone o canViewOrders.",
    input_schema: {
      type: "object",
      properties: {
        stato: { type: "string", description: "todo, in_progress, done, cancelled" },
        assegnatario_id: { type: "string", description: "UUID utente assegnatario" },
        order_id: { type: "string", description: "Filtra per ordine specifico" },
        limit: { type: "number", description: "Default 10, max 50" },
      },
    },
  },
  {
    name: "create_task",
    description: "Crea una nuova attività/task. RICHIEDE CONFERMA ESPLICITA prima dell'esecuzione. Richiede permesso canViewOrders.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titolo del task" },
        description: { type: "string", description: "Descrizione dettagliata" },
        assigned_to: { type: "string", description: "UUID utente assegnatario" },
        due_date: { type: "string", description: "Data scadenza ISO 8601 (es: 2025-05-15)" },
        order_id: { type: "string", description: "UUID ordine collegato (opzionale)" },
        priority: { type: "string", description: "low, medium, high (default: medium)" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_kpis",
    description: "KPI aziendali: fatturato, ordini aperti, task in scadenza. Richiede permesso canViewDashboard.",
    input_schema: {
      type: "object",
      properties: {
        periodo: { type: "string", description: "mese_corrente, trimestre, anno (default: mese_corrente)" },
      },
    },
  },
  {
    name: "get_employees",
    description: "Lista dipendenti/personale dell'azienda. Richiede permesso canViewPersone.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Default 20" },
      },
    },
  },
  {
    name: "get_calendar_events",
    description: "Appuntamenti e eventi del calendario aziendale. Richiede permesso canViewCalendar.",
    input_schema: {
      type: "object",
      properties: {
        data_da: { type: "string", description: "Data inizio range ISO 8601" },
        data_a: { type: "string", description: "Data fine range ISO 8601" },
        limit: { type: "number", description: "Default 10" },
      },
    },
  },
];

// ─── Permission check helper ──────────────────────────────────────────────────
function checkPermission(permissions: Record<string, boolean>, key: string): boolean {
  return permissions?.[key] === true || permissions?.["isAdmin"] === true;
}

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  permissions: Record<string, boolean>,
): Promise<unknown> {
  switch (toolName) {
    case "get_orders": {
      if (!checkPermission(permissions, "canViewOrders")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare gli ordini." };
      }
      let q = admin.from("orders").select("id, order_code, description, status, expected_date, work_start_date, work_end_date, created_at, customers(full_name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(Math.min(Number(toolInput.limit) || 10, 50));
      if (toolInput.stato) q = q.eq("status", toolInput.stato as string);
      if (toolInput.cliente_nome) q = q.ilike("customers.full_name", `%${toolInput.cliente_nome}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { orders: data, count: data?.length ?? 0 };
    }

    case "get_order_detail": {
      if (!checkPermission(permissions, "canViewOrders")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare gli ordini." };
      }
      const { data, error } = await admin.from("orders").select("*, customers(full_name, email, phone), order_items(*), notes(*)").eq("id", toolInput.order_id as string).eq("company_id", companyId).single();
      if (error) return { error: error.message };
      return data;
    }

    case "get_customers": {
      if (!checkPermission(permissions, "canViewCustomers")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare i clienti." };
      }
      let q = admin.from("customers").select("id, full_name, email, phone, city, created_at").eq("company_id", companyId).order("full_name").limit(Number(toolInput.limit) || 10);
      if (toolInput.nome) q = q.ilike("full_name", `%${toolInput.nome}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { customers: data, count: data?.length ?? 0 };
    }

    case "get_tasks": {
      if (!checkPermission(permissions, "canViewPersone") && !checkPermission(permissions, "canViewOrders")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare le attività." };
      }
      let q = admin.from("tasks").select("id, title, description, status, priority, due_date, assigned_to, order_id, created_at, profiles(first_name, last_name)").eq("company_id", companyId).order("due_date", { ascending: true }).limit(Math.min(Number(toolInput.limit) || 10, 50));
      if (toolInput.stato) q = q.eq("status", toolInput.stato as string);
      if (toolInput.assegnatario_id) q = q.eq("assigned_to", toolInput.assegnatario_id as string);
      if (toolInput.order_id) q = q.eq("order_id", toolInput.order_id as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { tasks: data, count: data?.length ?? 0 };
    }

    case "create_task": {
      // Creating tasks requires either order management or people management permissions
      if (!checkPermission(permissions, "canViewOrders") && !checkPermission(permissions, "canViewPersone")) {
        return { error: "permission_denied", message: "Non hai il permesso di creare attività." };
      }
      const { data, error } = await admin.from("tasks").insert({
        company_id: companyId,
        title: toolInput.title as string,
        description: toolInput.description as string || null,
        assigned_to: toolInput.assigned_to as string || userId,
        due_date: toolInput.due_date as string || null,
        order_id: toolInput.order_id as string || null,
        priority: (toolInput.priority as string) || "medium",
        status: "todo",
        created_by: userId,
      }).select().single();
      if (error) return { error: error.message };
      return { success: true, task: data, message: `Task "${data.title}" creato con successo!` };
    }

    case "get_kpis": {
      if (!checkPermission(permissions, "canViewDashboard") && !checkPermission(permissions, "canViewCruscotto")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare i KPI." };
      }
      const now = new Date();
      const periodo = (toolInput.periodo as string) || "mese_corrente";
      let periodoLabel = "mese corrente";
      let dateFrom: string;

      if (periodo === "anno") {
        dateFrom = new Date(now.getFullYear(), 0, 1).toISOString();
        periodoLabel = `anno ${now.getFullYear()}`;
      } else if (periodo === "trimestre") {
        const q = Math.floor(now.getMonth() / 3);
        dateFrom = new Date(now.getFullYear(), q * 3, 1).toISOString();
        periodoLabel = `Q${q + 1} ${now.getFullYear()}`;
      } else {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        periodoLabel = now.toLocaleString("it-IT", { month: "long", year: "numeric" });
      }

      const [ordersRes, tasksRes, newOrdersRes] = await Promise.all([
        admin.from("orders").select("id, status", { count: "exact" }).eq("company_id", companyId).neq("status", "annullato"),
        admin.from("tasks").select("id, status, due_date", { count: "exact" }).eq("company_id", companyId).neq("status", "done"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", dateFrom),
      ]);
      const overdueTasks = (tasksRes.data || []).filter((t) => t.due_date && new Date(t.due_date) < now).length;
      const lateOrders = (ordersRes.data || []).filter((o) => ["in_lavorazione", "confermato"].includes(o.status || "")).length;
      return {
        ordini_totali: ordersRes.count ?? 0,
        ordini_aperti: lateOrders,
        ordini_periodo: newOrdersRes.count ?? 0,
        task_aperti: tasksRes.count ?? 0,
        task_scaduti: overdueTasks,
        periodo_riferimento: periodoLabel,
        aggiornato_al: now.toISOString(),
      };
    }

    case "get_employees": {
      if (!checkPermission(permissions, "canViewPersone")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare il personale." };
      }
      const { data, error } = await admin.from("profiles").select("id, first_name, last_name, email, role").eq("company_id", companyId).order("first_name").limit(Number(toolInput.limit) || 20);
      if (error) return { error: error.message };
      return { employees: data, count: data?.length ?? 0 };
    }

    case "get_calendar_events": {
      if (!checkPermission(permissions, "canViewCalendar")) {
        return { error: "permission_denied", message: "Non hai il permesso di visualizzare il calendario." };
      }
      const today = new Date().toISOString().split("T")[0];
      let q = admin.from("appointments").select("id, title, appointment_date, appointment_time, appointment_type, assigned_to, is_completed, profiles(first_name, last_name)").eq("company_id", companyId).order("appointment_date", { ascending: true }).limit(Number(toolInput.limit) || 10);
      if (toolInput.data_da) q = q.gte("appointment_date", toolInput.data_da as string);
      else q = q.gte("appointment_date", today);
      if (toolInput.data_a) q = q.lte("appointment_date", toolInput.data_a as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { events: data, count: data?.length ?? 0 };
    }

    default:
      return { error: "unknown_tool", message: `Tool sconosciuto: ${toolName}` };
  }
}

// ─── System prompt builder ────────────────────────────────────────────────────
function buildSystemPrompt(
  companyName: string,
  companyId: string,
  userFullName: string,
  userRole: string,
  permissions: Record<string, boolean>,
): string {
  const activePerms = Object.entries(permissions).filter(([, v]) => v).map(([k]) => k).join(", ");
  const now = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

  return `Sei Lucia, l'assistente virtuale di ${companyName}.

REGOLE ASSOLUTE:
1. Accedi SOLO ai dati dell'azienda con company_id = '${companyId}'
2. Non rivelare MAI dati di altre aziende sulla piattaforma
3. Rispetta i permessi dell'utente — se un permesso manca, spiega educatamente che non puoi aiutare su quel tema
4. Quando non hai dati sufficienti, dillo esplicitamente
5. Non inventare mai numeri, date o nomi
6. Parla sempre in italiano, tono professionale e diretto
7. Per azioni di scrittura (create_task, ecc.), DEVI chiedere conferma all'utente prima di eseguire, mostrando un riepilogo dell'azione
8. Se l'utente conferma con "sì", "confermo", "vai", "ok", "procedi" → esegui l'azione
9. Rispondi sempre in modo conciso e utile, usa emoji con moderazione

CONTESTO AZIENDA:
- Nome: ${companyName}
- Data/ora attuale: ${now}

UTENTE CORRENTE:
- Nome: ${userFullName}
- Ruolo: ${userRole}
- Permessi attivi: ${activePerms || "nessuno (contatta l'amministratore)"}

CAPACITÀ IN BASE AI PERMESSI:
${permissions.canViewOrders ? "✅ Ordini e cantieri" : "❌ Ordini e cantieri (permesso mancante)"}
${permissions.canViewCustomers ? "✅ Clienti" : "❌ Clienti (permesso mancante)"}
${permissions.canViewPersone ? "✅ Personale e HR" : "❌ Personale (permesso mancante)"}
${permissions.canViewBilling ? "✅ Fatturazione" : "❌ Fatturazione (permesso mancante)"}
${permissions.canViewWarehouse ? "✅ Magazzino" : "❌ Magazzino (permesso mancante)"}
${permissions.canViewDashboard || permissions.canViewCruscotto ? "✅ KPI e Dashboard" : "❌ KPI (permesso mancante)"}
${permissions.canViewCalendar ? "✅ Calendario" : "❌ Calendario (permesso mancante)"}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return errorResponse("Metodo non consentito", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicKey) {
    return errorResponse("ANTHROPIC_API_KEY non configurata", 500);
  }

  // ── JWT Auth: verify the caller is a logged-in Supabase user ──────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return errorResponse("Authorization header mancante", 401);
  }

  // Use the user client (with the caller's JWT) to verify identity
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser();
  if (authError || !callerUser) {
    return errorResponse("Token non valido o scaduto", 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: {
    message: string;
    user_id: string;
    company_id: string;
    channel_id: string;
    user_permissions?: Record<string, boolean>;
    thinking_enabled?: boolean;
    thinking_budget?: number;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON non valido", 400);
  }

  const { message, user_id, company_id, channel_id, user_permissions = {}, thinking_enabled = false, thinking_budget = 8000 } = body;

  if (!message?.trim() || !user_id || !company_id || !channel_id) {
    return errorResponse("Parametri mancanti: message, user_id, company_id, channel_id", 400);
  }

  // Ensure the authenticated user matches the user_id in the body (prevent spoofing)
  if (callerUser.id !== user_id) {
    return errorResponse("user_id non corrisponde all'utente autenticato", 403);
  }

  // Verify company_id belongs to this user (prevent cross-company data access)
  const { data: profileCheck } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", user_id)
    .single();
  if (!profileCheck || profileCheck.company_id !== company_id) {
    return errorResponse("company_id non autorizzato per questo utente", 403);
  }

  try {
    // 1. Load user profile + company
    const [profileRes, companyRes] = await Promise.all([
      admin.from("profiles").select("first_name, last_name, role").eq("id", user_id).single(),
      admin.from("companies").select("name").eq("id", company_id).single(),
    ]);

    const userFullName = profileRes.data
      ? `${profileRes.data.first_name} ${profileRes.data.last_name}`
      : "Utente";
    const userRole = profileRes.data?.role ?? "membro";
    const companyName = companyRes.data?.name ?? "La tua azienda";

    // 2. Load/init conversation memory
    const { data: convData } = await admin
      .from("lucia_conversations")
      .select("messages")
      .eq("company_id", company_id)
      .eq("user_id", user_id)
      .single();

    type LuciaMessage = { role: "user" | "assistant"; content: string };
    const history: LuciaMessage[] = (convData?.messages as LuciaMessage[]) ?? [];
    const recentHistory = history.slice(-MAX_MEMORY_MESSAGES);

    // 3. Build messages array for Claude
    const claudeMessages = [
      ...recentHistory,
      { role: "user" as const, content: message.trim() },
    ];

    const systemPrompt = buildSystemPrompt(companyName, company_id, userFullName, userRole, user_permissions);

    // 4. Call Claude API (with tool_use agentic loop)
    let finalText = "";
    let loopMessages = [...claudeMessages];
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Build request payload — when thinking_enabled, add extended thinking params
      // Note: thinking is incompatible with tool_use on some models; disable tools when thinking
      const thinkingPayload = thinking_enabled
        ? {
            thinking: { type: "enabled", budget_tokens: Math.min(Math.max(thinking_budget, 1000), 32000) },
            max_tokens: Math.max(1024, thinking_budget + 1024),
            // Disable tools during extended thinking (API constraint)
            tools: undefined,
          }
        : {
            max_tokens: 1024,
            tools: LUCIA_TOOLS,
          };

      const claudeRes = await fetch(CLAUDE_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          ...(thinking_enabled ? { "anthropic-beta": "interleaved-thinking-2025-05-14" } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          system: systemPrompt,
          messages: loopMessages,
          ...thinkingPayload,
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error("Claude API error:", errText);
        throw new Error(`Errore Claude API: ${claudeRes.status}`);
      }

      const claudeData = await claudeRes.json();
      const stopReason = claudeData.stop_reason;

      // Add assistant turn to loop messages
      loopMessages.push({ role: "assistant", content: claudeData.content });

      if (stopReason === "end_turn") {
        // Extract text response (skip thinking blocks — they are internal reasoning)
        for (const block of claudeData.content) {
          if (block.type === "text") {
            finalText += block.text;
          }
          // block.type === "thinking" is intentionally ignored (not sent to user)
        }
        break;
      }

      if (stopReason === "tool_use") {
        // Execute all tool calls
        const toolResults = [];
        for (const block of claudeData.content) {
          if (block.type === "tool_use") {
            const toolResult = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              admin,
              company_id,
              user_id,
              user_permissions,
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(toolResult),
            });
          }
        }
        loopMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // max_tokens or unexpected stop
      for (const block of claudeData.content) {
        if (block.type === "text") finalText += block.text;
      }
      break;
    }

    if (!finalText) {
      finalText = "Mi dispiace, non sono riuscita a elaborare la risposta. Riprova tra poco.";
    }

    // 5. Save Lucia's response as a chat message (sender = lucia-bot UUID pattern)
    const LUCIA_SENDER_ID = "00000000-0000-0000-0000-000000000001"; // sentinel for Lucia
    const { data: savedMsg, error: msgError } = await admin
      .from("internal_chat_messages")
      .insert({
        channel_id,
        company_id,
        sender_id: LUCIA_SENDER_ID,
        content: finalText,
        message_type: "ai_response",
      })
      .select()
      .single();

    if (msgError) {
      console.error("Error saving Lucia message:", msgError);
    }

    // 6. Update conversation memory (keep last MAX_MEMORY_MESSAGES)
    const updatedHistory: LuciaMessage[] = [
      ...recentHistory,
      { role: "user", content: message.trim() },
      { role: "assistant", content: finalText },
    ].slice(-MAX_MEMORY_MESSAGES);

    await admin.from("lucia_conversations").upsert({
      company_id,
      user_id,
      messages: updatedHistory,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,user_id" });

    // 7. Return response
    return jsonResponse({
      reply: finalText,
      message_id: savedMsg?.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error(`lucia-chat error [${new Date().toISOString()}]:`, message);
    return errorResponse(message, 500);
  }
});
