/**
 * email-ai-assistant — AI per email (riassumi thread + suggerisci risposte)
 *
 * Body:
 *   { action: 'summary',          thread_id: string }
 *   { action: 'analysis',         thread_id: string }
 *   { action: 'operation_proposals', thread_id: string }
 *   { action: 'reply_suggestions', thread_id: string, language?: string }
 *
 * Output:
 *   summary  → { summary: "...", action_items: [...] }
 *   analysis → { category, priority, summary, action_items, extracted, suggested_action, ... }
 *   operation_proposals → crea proposte operative AI da confermare (email fornitore, ritardo ODA)
 *   reply_suggestions → { suggestions: [{ tone, label, body }, ...] (3 risposte rapide) }
 *
 * Auth: utente JWT (verifica ownership thread).
 *
 * Provider: OpenRouter (default Claude Haiku 4.5 — veloce + economico).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const MODEL_ID = "anthropic/claude-haiku-4.5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ThreadMessage {
  id: string;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string;
  raw_text: string | null;
}

interface EmailAnalysisResult {
  category: string;
  priority: string;
  summary: string;
  action_items: string[];
  extracted: Record<string, unknown>;
  suggested_action: string;
  intent: string;
  sentiment: string;
  risk_flags: string[];
  reply_strategy: string;
  operations: Record<string, unknown>;
}

const ALLOWED_CATEGORIES = new Set([
  "lead",
  "preventivo",
  "cliente_esistente",
  "fornitore",
  "fattura",
  "pratica_amministrativa",
  "support",
  "spam",
  "altro",
]);

const ALLOWED_PRIORITIES = new Set(["alta", "media", "bassa", "nessuna"]);

async function callClaude(systemPrompt: string, userPrompt: string, jsonMode = false): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://edilizia-in-cloud",
      "X-Title": "Email AI Assistant",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`openrouter_${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function formatThread(messages: ThreadMessage[]): string {
  return messages
    .map((m) => {
      const sender = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email;
      const date = new Date(m.received_at).toLocaleString("it-IT");
      const body = (m.raw_text ?? "").slice(0, 2000);
      return `--- Messaggio ${date} ---\nDa: ${sender}\nA: ${m.to_email}\nOggetto: ${m.subject ?? ""}\n\n${body}\n`;
    })
    .join("\n");
}

function normalizeCategory(value: unknown): string {
  const raw = String(value ?? "").toLowerCase().trim();
  if (raw === "quote_request" || raw === "richiesta_preventivo" || raw === "preventivi") {
    return "preventivo";
  }
  if (raw === "invoice") return "fattura";
  if (raw === "supplier") return "fornitore";
  if (raw === "customer") return "cliente_esistente";
  if (raw === "assistenza" || raw === "ticket") return "support";
  if (raw === "admin") return "pratica_amministrativa";
  return ALLOWED_CATEGORIES.has(raw) ? raw : "altro";
}

function normalizePriority(value: unknown): string {
  const raw = String(value ?? "").toLowerCase().trim();
  if (raw === "high") return "alta";
  if (raw === "medium") return "media";
  if (raw === "low") return "bassa";
  return ALLOWED_PRIORITIES.has(raw) ? raw : "nessuna";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeOperations(value: unknown): Record<string, unknown> {
  const raw = recordValue(value);
  const domain = String(raw.domain ?? "none").toLowerCase().trim() || "none";
  const confidenceValue = typeof raw.confidence === "number"
    ? raw.confidence
    : Number(raw.confidence ?? 0);
  return {
    ...raw,
    domain,
    confidence: Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(1, confidenceValue))
      : 0,
  };
}

function parseAnalysis(raw: string): EmailAnalysisResult {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = { summary: raw };
  }
  const extracted = recordValue(parsed.extracted);
  const operations = normalizeOperations(parsed.operations ?? extracted.operations);
  if (operations.domain !== "none" || Object.keys(operations).length > 2) {
    extracted.operations = operations;
  }
  const summary = String(parsed.summary ?? "").trim().slice(0, 500);
  return {
    category: normalizeCategory(parsed.category),
    priority: normalizePriority(parsed.priority),
    summary: summary || "Analisi completata, ma riepilogo non disponibile.",
    action_items: stringArray(parsed.action_items),
    extracted,
    suggested_action: String(parsed.suggested_action ?? "rispondi").trim().slice(0, 80),
    intent: String(parsed.intent ?? "non specificato").trim().slice(0, 160),
    sentiment: String(parsed.sentiment ?? "neutro").trim().slice(0, 60),
    risk_flags: stringArray(parsed.risk_flags),
    reply_strategy: String(parsed.reply_strategy ?? "").trim().slice(0, 500),
    operations,
  };
}

function buildAnalysisSystemPrompt(language: string): string {
  return `Sei un AI email analyst operativo per imprese edili italiane.
Analizza un thread email e produci un output pronto per CRM, acquisti, logistica, DDT e gestione aziendale.

Categorie permesse:
- "lead" → nuovo potenziale cliente generico
- "preventivo" → richiesta prezzo, offerta, sopralluogo, capitolato o preventivo
- "cliente_esistente" → cliente già attivo
- "fornitore" → fornitore, ordine, DDT, logistica, acquisti materiali
- "fattura" → fattura, pagamento, scadenza contabile
- "pratica_amministrativa" → comune, INPS, AdE, CILA/SCIA, documenti amministrativi
- "support" → richiesta assistenza, bug, problema operativo
- "spam" → newsletter, promo, phishing, irrilevante
- "altro" → non classificabile

Priorità permesse: "alta", "media", "bassa", "nessuna".

Devi riconoscere in modo speciale le email operative:
- richiesta acquisto merce a fornitore
- conferma ordine fornitore
- ritardo consegna fornitore
- modifica data consegna
- DDT ricevuto o da abbinare a ODA
- materiale mancante, parziale, danneggiato
- fattura o pagamento fornitore collegato a ordine/DDT

Rispondi SOLO in JSON valido:
{
  "category": "una_categoria_permessa",
  "priority": "una_priorita_permessa",
  "summary": "massimo 2 frasi, pratico",
  "intent": "cosa vuole davvero il mittente",
  "sentiment": "positivo|neutro|preoccupato|arrabbiato|urgente",
  "action_items": ["azioni concrete in ordine di priorità"],
  "risk_flags": ["rischi o criticità da non perdere"],
  "extracted": {
    "nome": null,
    "telefono": null,
    "email": null,
    "azienda": null,
    "indirizzo": null,
    "importo_eur": null,
    "scadenza": null,
    "riferimenti_documenti": [],
    "parole_chiave": []
  },
  "operations": {
    "domain": "none|supplier_order|supplier_delay|supplier_confirmation|ddt_receipt|invoice_payment|customer_request",
    "confidence": 0.0,
    "supplier": { "name": null, "email": null },
    "purchase_order": { "id": null, "number": null, "reference_text": null },
    "delivery": {
      "status": "unknown|confirmed|delayed|partial|blocked",
      "original_date": null,
      "new_date": null,
      "delay_days": null,
      "reason": null
    },
    "ddt": { "number": null, "date": null, "items": [] },
    "items": [
      { "description": "materiale", "sku": null, "quantity": null, "unit": null }
    ],
    "recommended_actions": [
      {
        "type": "supplier_followup|purchase_email|update_purchase_order_delay|match_ddt|create_logistics_task|reply_only",
        "label": "azione leggibile",
        "risk": "yellow|red",
        "requires_confirmation": true,
        "payload": {}
      }
    ],
    "draft_email": {
      "to": null,
      "subject": null,
      "body": null
    }
  },
  "suggested_action": "crea_lead|crea_preventivo|rispondi|carica_fattura|apri_ticket|archivia|spam|sollecita_fornitore|aggiorna_ritardo_oda|abbina_ddt|crea_task_logistica|prepara_ordine_fornitore",
  "reply_strategy": "come rispondere in modo efficace"
}

Regole:
- Non inventare dati non presenti: usa null.
- Se non trovi un riferimento ODA certo, metti purchase_order.id=null e number solo se citato nel testo.
- Per modifiche a ODA, DDT, magazzino o invii email, proponi sempre requires_confirmation=true.
- Se il fornitore comunica un ritardo o nuova data, category="fornitore", priority almeno "media", operations.domain="supplier_delay".
- Se è una richiesta preventivo, category="preventivo".
- Se richiede risposta entro 24h, priority="alta".
- Se è spam, priority="nessuna" e suggested_action="spam".
- Output in ${language}.`;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainTextToHtml(value: string): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function buildFallbackSupplierDraft(args: {
  supplierEmail: string | null;
  supplierName: string | null;
  poNumber: string | null;
  newDate: string | null;
  summary: string;
}): { to: string; subject: string; body: string } | null {
  if (!args.supplierEmail) return null;
  const subject = args.newDate
    ? `Conferma nuova data consegna${args.poNumber ? ` ODA ${args.poNumber}` : ""}`
    : `Richiesta aggiornamento ordine${args.poNumber ? ` ODA ${args.poNumber}` : ""}`;
  const greeting = args.supplierName ? `Buongiorno ${args.supplierName},` : "Buongiorno,";
  const body = [
    greeting,
    "",
    args.newDate
      ? `abbiamo ricevuto l'aggiornamento sulla consegna${args.poNumber ? ` dell'ODA ${args.poNumber}` : ""}. Vi chiediamo conferma della nuova data prevista ${args.newDate} e di eventuali impatti su quantità o materiali.`
      : `ci serve un aggiornamento operativo${args.poNumber ? ` sull'ODA ${args.poNumber}` : ""}: data prevista, eventuali ritardi e materiali confermati.`,
    "",
    `Nota interna rilevata dall'AI: ${args.summary}`,
    "",
    "Grazie,",
  ].join("\n");
  return { to: args.supplierEmail, subject, body };
}

function normalizedOperationalItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = recordValue(item);
      const name = stringField(record, "description") ?? stringField(record, "name") ?? stringField(record, "material");
      if (!name) return null;
      const quantityValue = record.quantity ?? record.qty;
      const quantity = typeof quantityValue === "number"
        ? quantityValue
        : Number(String(quantityValue ?? "").replace(",", "."));
      return {
        material_sku: stringField(record, "sku"),
        name,
        qty: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
        unit: stringField(record, "unit"),
        price_estimate: typeof record.price_estimate === "number" ? record.price_estimate : null,
        note: stringField(record, "note"),
      };
    })
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 25);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function createOperationalProposals(
  supabase: ReturnType<typeof createClient>,
  args: {
    analysis: EmailAnalysisResult;
    thread: Record<string, unknown>;
    messages: ThreadMessage[];
    userId: string;
  },
): Promise<Array<{ id: string; action_type: string; summary: string }>> {
  const companyId = stringField(args.thread, "company_id");
  const threadId = stringField(args.thread, "id");
  if (!companyId || !threadId) return [];

  const latestMessage = args.messages[args.messages.length - 1];
  const operations = normalizeOperations(args.analysis.operations ?? args.analysis.extracted.operations);
  if (operations.domain === "none") return [];

  const supplier = recordValue(operations.supplier);
  const purchaseOrder = recordValue(operations.purchase_order);
  const delivery = recordValue(operations.delivery);
  const draftEmail = recordValue(operations.draft_email);

  const supplierEmail = stringField(supplier, "email") ?? latestMessage.from_email;
  const supplierName = stringField(supplier, "name") ?? latestMessage.from_name;
  const poId = stringField(purchaseOrder, "id");
  const poNumber = stringField(purchaseOrder, "number");
  const newDate = stringField(delivery, "new_date");
  const oldDate = stringField(delivery, "original_date");
  const ddt = recordValue(operations.ddt);
  const ddtNumber = stringField(ddt, "number");
  const deliveryStatus = stringField(delivery, "status");
  const items = normalizedOperationalItems(operations.items);

  const rows: Array<Record<string, unknown>> = [];

  if (
    items.length > 0 &&
    ["supplier_order", "supplier_confirmation"].includes(String(operations.domain)) &&
    !poId &&
    !poNumber
  ) {
    rows.push({
      company_id: companyId,
      user_id: args.userId,
      persona_key: "email_ai",
      action_type: "create_purchase_order",
      summary: `Crea proposta ODA da email fornitore${supplierName ? ` (${supplierName})` : ""}`.slice(0, 200),
      payload: {
        items,
        supplier_email: supplierEmail,
        supplier_name: supplierName,
        expected_delivery_date: newDate,
        proposal_reason: args.analysis.summary,
        source: "email_ai",
        source_thread_id: threadId,
        source_email_id: latestMessage.id,
        confidence: operations.confidence,
      },
      status: "pending",
      risk_level: "yellow",
    });
  }

  if (newDate && (poId || poNumber)) {
    rows.push({
      company_id: companyId,
      user_id: args.userId,
      persona_key: "email_ai",
      action_type: "update_purchase_order_delay",
      summary: `Aggiorna consegna${poNumber ? ` ODA ${poNumber}` : " ordine fornitore"} al ${newDate}`.slice(0, 200),
      payload: {
        purchase_order_id: poId,
        purchase_order_number: poNumber,
        old_expected_delivery_date: oldDate,
        new_expected_delivery_date: newDate,
        reason: stringField(delivery, "reason") ?? args.analysis.summary,
        source: "email_ai",
        source_thread_id: threadId,
        source_email_id: latestMessage.id,
        supplier_email: supplierEmail,
        confidence: operations.confidence,
      },
      status: "pending",
      risk_level: "yellow",
    });
  }

  if (
    operations.domain === "ddt_receipt" ||
    ddtNumber ||
    deliveryStatus === "partial" ||
    deliveryStatus === "blocked" ||
    (operations.domain === "supplier_delay" && !poId && !poNumber)
  ) {
    const taskTitle = ddtNumber
      ? `Verifica DDT ${ddtNumber}${poNumber ? ` su ODA ${poNumber}` : ""}`
      : operations.domain === "supplier_delay"
        ? `Verifica ritardo fornitore${supplierName ? ` ${supplierName}` : ""}`
        : `Verifica consegna fornitore${supplierName ? ` ${supplierName}` : ""}`;
    rows.push({
      company_id: companyId,
      user_id: args.userId,
      persona_key: "email_ai",
      action_type: "create_logistics_task",
      summary: taskTitle.slice(0, 200),
      payload: {
        title: taskTitle,
        notes: [
          args.analysis.summary,
          poNumber ? `ODA rilevata: ${poNumber}` : null,
          ddtNumber ? `DDT rilevato: ${ddtNumber}` : null,
          newDate ? `Nuova data consegna: ${newDate}` : null,
          supplierEmail ? `Fornitore: ${supplierEmail}` : null,
        ].filter(Boolean).join("\n"),
        due_date: todayIsoDate(),
        priority: operations.domain === "supplier_delay" || deliveryStatus === "blocked" ? "alta" : "normale",
        category: "logistica",
        source: "email_ai",
        source_thread_id: threadId,
        source_email_id: latestMessage.id,
        operations,
      },
      status: "pending",
      risk_level: "green",
    });
  }

  const explicitDraft = {
    to: stringField(draftEmail, "to"),
    subject: stringField(draftEmail, "subject"),
    body: stringField(draftEmail, "body"),
  };
  const fallbackDraft = buildFallbackSupplierDraft({
    supplierEmail,
    supplierName,
    poNumber,
    newDate,
    summary: args.analysis.summary,
  });
  const finalDraft = explicitDraft.to && explicitDraft.subject && explicitDraft.body
    ? explicitDraft as { to: string; subject: string; body: string }
    : fallbackDraft;

  if (finalDraft) {
    rows.push({
      company_id: companyId,
      user_id: args.userId,
      persona_key: "email_ai",
      action_type: "generic_email",
      summary: `Invia email fornitore: ${finalDraft.subject}`.slice(0, 200),
      payload: {
        to: finalDraft.to,
        subject: finalDraft.subject,
        body: plainTextToHtml(finalDraft.body),
        source: "email_ai",
        source_thread_id: threadId,
        source_email_id: latestMessage.id,
        operations,
      },
      status: "pending",
      risk_level: "red",
    });
  }

  if (rows.length === 0) return [];

  const actionTypes = [...new Set(rows.map((row) => String(row.action_type)))];
  const { data: existing } = await supabase
    .from("ai_action_proposals")
    .select("id, action_type, summary")
    .eq("company_id", companyId)
    .eq("user_id", args.userId)
    .eq("status", "pending")
    .in("action_type", actionTypes)
    .filter("payload->>source_thread_id", "eq", threadId);

  if (existing && existing.length > 0) {
    return existing as Array<{ id: string; action_type: string; summary: string }>;
  }

  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert(rows)
    .select("id, action_type, summary");

  if (error) throw error;
  return (data ?? []) as Array<{ id: string; action_type: string; summary: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) {
    return jsonRes({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: { action?: string; thread_id?: string; language?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.thread_id) return jsonRes({ ok: false, error: "thread_id required" }, 400);
  if (
    body.action !== "summary" &&
    body.action !== "analysis" &&
    body.action !== "operation_proposals" &&
    body.action !== "reply_suggestions"
  ) {
    return jsonRes({
      ok: false,
      error: "action must be 'summary', 'analysis', 'operation_proposals' or 'reply_suggestions'",
    }, 400);
  }

  // Carica thread + verifica ownership
  const { data: thread, error: thErr } = await supabase
    .from("email_threads")
    .select("id, user_id, company_id, subject_normalized")
    .eq("id", body.thread_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (thErr || !thread) {
    return jsonRes({ ok: false, error: "Thread not found or access denied" }, 404);
  }

  const { data: messages } = await supabase
    .from("email_inbox")
    .select("id, from_email, from_name, to_email, subject, received_at, raw_text")
    .eq("thread_id", body.thread_id)
    .eq("user_id", userId)
    .order("received_at", { ascending: true });

  if (!messages || messages.length === 0) {
    return jsonRes({ ok: false, error: "No messages in thread" }, 404);
  }

  const threadText = formatThread(messages as ThreadMessage[]);
  const language = body.language ?? "italiano";

  try {
    if (body.action === "summary") {
      const sys = `Sei un assistente email per imprenditori italiani edili.
Ricevi un thread email completo. Devi:
1. Sintetizzare in 2-3 frasi MAX cosa vogliono / chiedono / dicono
2. Estrarre gli "action items" concreti per chi riceve (cose da fare, decisioni, scadenze)

Rispondi SEMPRE in JSON valido con questa struttura:
{
  "summary": "...",
  "action_items": ["...", "..."]
}

Lingua output: ${language}. Sii conciso, asciutto, focus sull'utile.`;
      const userPrompt = `Thread email da analizzare:\n\n${threadText}`;
      const raw = await callClaude(sys, userPrompt, true);
      let parsed: { summary?: string; action_items?: string[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { summary: raw, action_items: [] };
      }
      return jsonRes({
        ok: true,
        summary: parsed.summary ?? "",
        action_items: parsed.action_items ?? [],
      });
    }

    if (body.action === "analysis" || body.action === "operation_proposals") {
      const sys = buildAnalysisSystemPrompt(language);
      const raw = await callClaude(sys, `Thread email da analizzare:\n\n${threadText}`, true);
      const analysis = parseAnalysis(raw);
      const latestMessage = (messages as ThreadMessage[])[(messages as ThreadMessage[]).length - 1];
      if (latestMessage?.id) {
        await supabase
          .from("email_inbox")
          .update({
            ai_category: analysis.category,
            ai_priority: analysis.priority,
            ai_summary: analysis.summary.slice(0, 200),
            ai_extracted: {
              ...analysis.extracted,
              intent: analysis.intent,
              sentiment: analysis.sentiment,
              risk_flags: analysis.risk_flags,
              action_items: analysis.action_items,
              reply_strategy: analysis.reply_strategy,
              operations: analysis.operations,
            },
            ai_suggested_action: analysis.suggested_action,
            ai_processed_at: new Date().toISOString(),
            ai_error: null,
            status: analysis.category === "spam" ? "spam" : "triaged",
          })
          .eq("id", latestMessage.id)
          .eq("user_id", userId);
      }

      if (body.action === "operation_proposals") {
        const proposals = await createOperationalProposals(supabase, {
          analysis,
          thread: thread as Record<string, unknown>,
          messages: messages as ThreadMessage[],
          userId,
        });
        return jsonRes({ ok: true, analysis, proposals });
      }

      return jsonRes({ ok: true, analysis });
    }

    // reply_suggestions
    const sys = `Sei un assistente email per imprenditori italiani edili.
Ricevi un thread email. Genera 3 BOZZE DI RISPOSTA brevi (40-80 parole ciascuna),
ognuna con un tono diverso:
- "veloce": risposta molto breve, professionale, taglio operativo
- "dettagliata": risposta completa che indirizza tutti i punti
- "negoziale": risposta che chiede chiarimenti o propone alternative

Rispondi SEMPRE in JSON valido:
{
  "suggestions": [
    { "tone": "veloce", "label": "...etichetta breve...", "body": "...testo risposta..." },
    { "tone": "dettagliata", "label": "...", "body": "..." },
    { "tone": "negoziale", "label": "...", "body": "..." }
  ]
}

Lingua: ${language}. Le risposte devono essere pronte da inviare (no placeholder).`;
    const userPrompt = `Thread email a cui rispondere (ultimo messaggio = il più recente):\n\n${threadText}`;
    const raw = await callClaude(sys, userPrompt, true);
    let parsed: { suggestions?: Array<{ tone: string; label: string; body: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { suggestions: [] };
    }
    return jsonRes({
      ok: true,
      suggestions: parsed.suggestions ?? [],
    });
  } catch (e) {
    return jsonRes({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
