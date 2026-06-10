/**
 * email-ai-assistant — AI per email (riassumi thread + suggerisci risposte)
 *
 * Body:
 *   { action: 'summary',          thread_id: string }
 *   { action: 'analysis',         thread_id: string }
 *   { action: 'operation_proposals', thread_id: string }
 *   { action: 'reply_suggestions', thread_id: string, language?: string }
 *   { action: 'triage_inbox',     company_id?: string, limit?: number }
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
import { fetchWithRetry } from "../_shared/fetchWithRetry.ts";
import { chargeDirectAiCall } from "../_shared/directAiLedger.ts";

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

interface InboxTriageRow {
  id: string;
  company_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  raw_text: string | null;
  attachments: unknown;
  received_at: string;
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

const TRIAGE_CATEGORY_TERMS: Array<{
  category: string;
  priority: "alta" | "media" | "bassa" | "nessuna";
  suggestedAction: string;
  terms: string[];
}> = [
  {
    category: "fornitore",
    priority: "media",
    suggestedAction: "verifica_fornitore",
    terms: ["oda", "ordine di acquisto", "ordine acquisto", "fornitore", "consegna", "merce", "bancali", "spedizione"],
  },
  {
    category: "fornitore",
    priority: "alta",
    suggestedAction: "abbina_ddt",
    terms: ["ddt", "documento di trasporto", "bolla", "colli", "parziale", "danneggiato"],
  },
  {
    category: "preventivo",
    priority: "media",
    suggestedAction: "crea_preventivo",
    terms: ["preventivo", "offerta", "computo", "sopralluogo", "ristrutturazione", "serramenti", "bagno"],
  },
  {
    category: "lead",
    priority: "alta",
    suggestedAction: "crea_lead",
    terms: ["nuovo lead", "richiesta contatto", "form contatto", "budget", "zona"],
  },
  {
    category: "fattura",
    priority: "media",
    suggestedAction: "carica_fattura",
    terms: ["fattura", "iva", "bonifico", "pagamento", "scadenza", "insoluto"],
  },
  {
    category: "pratica_amministrativa",
    priority: "media",
    suggestedAction: "crea_task_amministrazione",
    terms: ["commercialista", "contabilita", "f24", "agenzia entrate", "cassetto fiscale", "cila", "scia"],
  },
  {
    category: "support",
    priority: "alta",
    suggestedAction: "apri_ticket",
    terms: ["reclamo", "guasto", "problema", "non funziona", "assistenza", "urgente", "bloccato"],
  },
  {
    category: "spam",
    priority: "nessuna",
    suggestedAction: "spam",
    terms: ["unsubscribe", "hai vinto", "casino", "crypto", "lotteria", "offerta imperdibile"],
  },
];

/**
 * Chiama Claude via OpenRouter.
 * 2026-05-26 (cost optimization):
 *  - max_tokens parametrico (analysis=900, reply=600, summary=350)
 *  - temperature differenziata: 0.2 per analisi (deterministica), 0.5 per reply
 *  - prompt caching via cache_control sulla parte system (sconto 90% sui token
 *    cachati). I system prompt sono statici → cache hit immediato dopo la prima.
 *  - response_format json_object resta per evitare backtick markdown
 */
interface CallClaudeOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  // Se presente, registra la chiamata nel ledger centrale ai_call_ledger
  // (audit AI 2026-06: prima questa funzione spendeva su OpenRouter senza
  // tracciamento costi). Best-effort: un errore di charge non blocca.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ledger?: { supabase: any; companyId: string | null; userId: string | null };
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  options: CallClaudeOptions = {},
): Promise<string> {
  const { jsonMode = false, maxTokens = 900, temperature = 0.3 } = options;
  const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://edilizia-in-cloud",
      "X-Title": "Email AI Assistant",
      // OpenRouter passa attraverso il cache_control nativo Anthropic.
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        {
          role: "system",
          content: [{
            type: "text",
            text: systemPrompt,
            // Cache system prompt → primo richiamo paga full price, successivi
            // pagano 1/10 sui token cachati (TTL ~5 min).
            cache_control: { type: "ephemeral" },
          }],
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`openrouter_${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  // Registra nel ledger centrale (best-effort). Haiku 4.5: $1/1M in, $5/1M out.
  if (options.ledger?.companyId) {
    try {
      const tokIn = json.usage?.prompt_tokens ?? 0;
      const tokOut = json.usage?.completion_tokens ?? 0;
      await chargeDirectAiCall({
        supabase: options.ledger.supabase,
        idempotencyKey: `email-ai-assistant:${crypto.randomUUID()}`,
        companyId: options.ledger.companyId,
        userId: options.ledger.userId,
        taskKey: "email_ai_assistant",
        tierKey: "t3_balanced",
        modelUsed: MODEL_ID,
        tokensIn: tokIn,
        tokensOut: tokOut,
        costRealUsd: (tokIn / 1_000_000) * 1.0 + (tokOut / 1_000_000) * 5.0,
      });
    } catch (e) {
      console.warn("[email-ai-assistant] ledger charge skipped:", e instanceof Error ? e.message : String(e));
    }
  }

  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Parse JSON robusto da output AI.
 * 2026-05-26: il modello a volte risponde con markdown fences ```json … ```
 * oppure con testo prosa prima/dopo il JSON. Prima il fallback piazzava il
 * raw nella `summary` → l'utente vedeva codice grezzo nell'UI.
 * Ora:
 *  1. Strip fences ```json … ``` o ``` … ```
 *  2. Se ancora non parsabile, estrai la prima sostringa { … } bilanciata
 *  3. Solo come ultima risorsa restituisce parsed-fallback empty object
 */
function safeJsonParse<T = Record<string, unknown>>(raw: string): T {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return {} as T;
  // 1) Markdown fences
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  const candidate1 = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate1) as T;
  } catch { /* keep trying */ }
  // 2) Estrai primo { … } bilanciato
  const firstBrace = candidate1.indexOf("{");
  const lastBrace = candidate1.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate1.slice(firstBrace, lastBrace + 1)) as T;
    } catch { /* fallthrough */ }
  }
  return {} as T;
}

/**
 * Serializza il thread in testo leggibile per il modello.
 * 2026-05-26 (cost reduction):
 *  - Max 5 messaggi (i più recenti) per thread
 *  - Body cap 1200 char per messaggio (era 2000) — sufficiente per intent
 *    + action items, le firme aziendali lunghe in fondo non aggiungono info
 *  - Total cap implicito: 5 × ~1400 = 7000 char ≈ 1750 token (era illimitato)
 */
function formatThread(messages: ThreadMessage[]): string {
  const recent = messages.slice(-5);
  const omitted = messages.length - recent.length;
  const header = omitted > 0
    ? `[Mostro solo gli ultimi ${recent.length} messaggi del thread (${omitted} precedenti omessi).]\n\n`
    : "";
  return header + recent
    .map((m) => {
      const sender = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email;
      const date = new Date(m.received_at).toLocaleString("it-IT");
      // Strippa firma aziendale standard a fondo email per ridurre rumore
      const body = stripSignature((m.raw_text ?? "").slice(0, 1200));
      return `--- Messaggio ${date} ---\nDa: ${sender}\nOggetto: ${m.subject ?? ""}\n\n${body}\n`;
    })
    .join("\n");
}

/** Strip firma email comune (signal-to-noise). */
function stripSignature(body: string): string {
  // Pattern standard: "--", "Cordiali saluti", "Inviato da iPhone/Android", ecc.
  const cutPatterns = [
    /\n--\s*\n/,
    /\n_{3,}\n/,
    /\nCordiali saluti[\s\S]*$/i,
    /\nDistinti saluti[\s\S]*$/i,
    /\nInviato da (mio iPhone|mio iPad|Android|Outlook)[\s\S]*$/i,
    /\nSent from my (iPhone|iPad|Android)[\s\S]*$/i,
  ];
  let cut = body;
  for (const pattern of cutPatterns) {
    const idx = cut.search(pattern);
    if (idx > 100) cut = cut.slice(0, idx); // mantieni almeno 100 char
  }
  return cut.trim();
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attachmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return String(record.name ?? record.filename ?? record.file_name ?? "").trim();
  }).filter(Boolean);
}

function priorityRank(value: string): number {
  if (value === "alta") return 3;
  if (value === "media") return 2;
  if (value === "bassa") return 1;
  return 0;
}

function compactSummary(row: InboxTriageRow, matchedTerms: string[]): string {
  const sender = row.from_name || row.from_email || "Mittente sconosciuto";
  const subject = row.subject || "senza oggetto";
  const reason = matchedTerms.length ? `Segnali: ${matchedTerms.slice(0, 3).join(", ")}.` : "Classificazione predittiva.";
  return `${sender} · ${subject}. ${reason}`.slice(0, 500);
}

function classifyInboxRow(row: InboxTriageRow): {
  category: string;
  priority: string;
  summary: string;
  suggested_action: string;
  extracted: Record<string, unknown>;
} {
  const text = normalizeText([
    row.from_email,
    row.from_name,
    row.subject,
    row.raw_text?.slice(0, 1800),
    attachmentNames(row.attachments).join(" "),
  ].filter(Boolean).join(" "));

  let best = {
    category: "altro",
    priority: "bassa",
    suggestedAction: "rispondi",
    score: 0,
    terms: [] as string[],
  };

  for (const rule of TRIAGE_CATEGORY_TERMS) {
    const terms = rule.terms.filter((term) => text.includes(normalizeText(term)));
    const score = terms.length * 10 + priorityRank(rule.priority);
    if (score > best.score) {
      best = {
        category: rule.category,
        priority: rule.priority,
        suggestedAction: rule.suggestedAction,
        score,
        terms,
      };
    }
  }

  const urgentTerms = ["urgente", "entro oggi", "entro domani", "scadenza", "bloccato", "ritardo", "insoluto", "reclamo"];
  const urgentHits = urgentTerms.filter((term) => text.includes(term));
  const priority = urgentHits.length > 0 && best.category !== "spam"
    ? "alta"
    : best.priority;
  const terms = [...new Set([...best.terms, ...urgentHits])];

  return {
    category: best.category,
    priority,
    summary: compactSummary(row, terms),
    suggested_action: best.suggestedAction,
    extracted: {
      auto_triage: true,
      triage_version: "email_fast_v1",
      confidence: Math.max(0.38, Math.min(0.94, 0.42 + best.score / 80)),
      matched_terms: terms,
      sender: {
        name: row.from_name,
        email: row.from_email,
      },
      received_at: row.received_at,
    },
  };
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
  // 2026-05-26: parser robusto via safeJsonParse (strip markdown fences + extract
  // first balanced JSON). Niente più dump di JSON grezzo nella summary lato UI.
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  const extracted = recordValue(parsed.extracted);
  const operations = normalizeOperations(parsed.operations ?? extracted.operations);
  if (operations.domain !== "none" || Object.keys(operations).length > 2) {
    extracted.operations = operations;
  }
  let summary = String(parsed.summary ?? "").trim();
  // Difesa profonda: se il modello ha messo del JSON dentro summary (capitato),
  // estrai a sua volta. Se inizia con { o ```, è probabile parse fail nested.
  if (summary.startsWith("{") || summary.startsWith("```")) {
    const inner = safeJsonParse<Record<string, unknown>>(summary);
    if (typeof inner.summary === "string" && inner.summary.trim()) {
      summary = inner.summary.trim();
    } else {
      summary = "";
    }
  }
  summary = summary.slice(0, 500);
  return {
    category: normalizeCategory(parsed.category),
    priority: normalizePriority(parsed.priority),
    summary: summary || "Riepilogo non disponibile per questa email.",
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
  return `AI email analyst per imprese edili italiane. Analizza un thread email.

Categorie:
- "lead" = nuovo potenziale cliente
- "preventivo" = richiesta prezzo/offerta/sopralluogo/capitolato
- "cliente_esistente" = cliente già attivo
- "fornitore" = ordine, DDT, logistica, materiali, ritardo consegna
- "fattura" = fattura, pagamento, scadenza
- "pratica_amministrativa" = comune, INPS, AdE, CILA/SCIA
- "support" = assistenza, bug, problema
- "spam" = newsletter/promo/phishing
- "altro" = non classificabile

Priorità: "alta" (richiede azione entro 24h), "media", "bassa", "nessuna" (spam).

Riconosci email operative: acquisto/conferma/ritardo/modifica ordine fornitore,
DDT ricevuto, materiale parziale/danneggiato, fattura collegata a ODA.

REGOLE FORMATO (CRITICHE):
- Output SOLO JSON valido (no markdown, no \`\`\`, no testo prima/dopo).
- Niente null come "null" string → usa null vero.
- Lingua valori testuali: ${language}.

Schema esatto:
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

Regole anti-allucinazione:
- Mai inventare: dati assenti → null.
- purchase_order.number SOLO se citato esplicitamente nel testo.
- Tutte le azioni che modificano ODA/DDT/magazzino: requires_confirmation=true.
- Ritardo/nuova data fornitore: category="fornitore", priority≥"media", operations.domain="supplier_delay".
- Richiesta preventivo: category="preventivo".
- Risposta richiesta entro 24h: priority="alta".
- Spam: priority="nessuna", suggested_action="spam".

Summary: 1-2 frasi pratiche. Niente "questa email parla di…", vai dritto.`;
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

  let body: { action?: string; thread_id?: string; language?: string; company_id?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === "triage_inbox") {
    const limit = Math.max(1, Math.min(80, Number(body.limit ?? 30)));
    let inboxQuery = supabase
      .from("email_inbox")
      .select("id, company_id, from_email, from_name, subject, raw_text, attachments, received_at")
      .eq("user_id", userId)
      .eq("is_trashed", false)
      .or("ai_processed_at.is.null,ai_category.is.null")
      .order("received_at", { ascending: false })
      .limit(limit);

    if (body.company_id) {
      inboxQuery = inboxQuery.eq("company_id", body.company_id);
    }

    const { data: inboxRows, error: inboxError } = await inboxQuery;
    if (inboxError) return jsonRes({ ok: false, error: inboxError.message }, 500);

    let processed = 0;
    const categories: Record<string, number> = {};
    for (const row of (inboxRows ?? []) as InboxTriageRow[]) {
      const triage = classifyInboxRow(row);
      const { error: updateError } = await supabase
        .from("email_inbox")
        .update({
          ai_category: triage.category,
          ai_priority: triage.priority,
          ai_summary: triage.summary,
          ai_suggested_action: triage.suggested_action,
          ai_extracted: triage.extracted,
          ai_processed_at: new Date().toISOString(),
          ai_error: null,
        })
        .eq("id", row.id)
        .eq("user_id", userId);

      if (!updateError) {
        processed++;
        categories[triage.category] = (categories[triage.category] ?? 0) + 1;
      }
    }

    return jsonRes({
      ok: true,
      processed,
      categories,
    });
  }

  if (!body.thread_id) return jsonRes({ ok: false, error: "thread_id required" }, 400);
  if (
    body.action !== "summary" &&
    body.action !== "analysis" &&
    body.action !== "operation_proposals" &&
    body.action !== "reply_suggestions"
  ) {
    return jsonRes({
      ok: false,
      error: "action must be 'summary', 'analysis', 'operation_proposals', 'reply_suggestions' or 'triage_inbox'",
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
  // Contesto per il tracking costi nel ledger centrale (audit AI 2026-06).
  const ledgerCtx = {
    supabase,
    companyId: (thread as { company_id?: string | null }).company_id ?? body.company_id ?? null,
    userId,
  };

  try {
    if (body.action === "summary") {
      const sys = `Sei un assistente email per imprenditori italiani edili.
Sintetizza in 2-3 frasi cosa chiede l'email e estrai gli action items concreti.

Rispondi SOLO JSON valido (no markdown, no testo extra):
{"summary":"...","action_items":["...","..."]}

Lingua: ${language}. Conciso, asciutto, focus operativo.`;
      const userPrompt = `Thread email:\n\n${threadText}`;
      const raw = await callClaude(sys, userPrompt, { jsonMode: true, maxTokens: 350, temperature: 0.3, ledger: ledgerCtx });
      const parsed = safeJsonParse<{ summary?: string; action_items?: string[] }>(raw);
      return jsonRes({
        ok: true,
        summary: parsed.summary ?? "",
        action_items: parsed.action_items ?? [],
      });
    }

    if (body.action === "analysis" || body.action === "operation_proposals") {
      const sys = buildAnalysisSystemPrompt(language);
      // analysis: maxTokens 900 ampio per coprire operations object completo
      // temperature 0.2 per output deterministico (stessa email → stessa classificazione)
      const raw = await callClaude(sys, `Thread email da analizzare:\n\n${threadText}`, {
        jsonMode: true,
        maxTokens: 900,
        temperature: 0.2,
        ledger: ledgerCtx,
      });
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
    // 2026-05-26: toni rinominati per essere veramente utili al contesto edile
    // (era "veloce/dettagliata/negoziale" — confuso). Ora:
    //  - "conferma" = accetto/confermo, no domande
    //  - "domanda" = chiedo chiarimento prima di impegnarmi
    //  - "rilancio" = propongo alternativa o controparte
    const sys = `Sei un assistente email per imprenditori italiani edili.
Genera 3 bozze di risposta brevi (40-80 parole), pronte da inviare.

Toni richiesti:
- "conferma": accetti / confermi / dai il via. Tono cortese e diretto.
- "domanda": chiedi 1-2 chiarimenti specifici prima di impegnarti
- "rilancio": proponi un'alternativa, controparte, o sposti la data

Regole:
- NESSUN placeholder tipo [NOME] o [DATA] — usa info reali dal thread o
  formulazioni naturali ("come anticipato", "ti faccio sapere domani")
- Saluto + chiusura inclusi
- Lessico imprenditoriale concreto (no formalismi inutili)
- Lingua: ${language}

Rispondi SOLO JSON valido (no markdown):
{"suggestions":[{"tone":"conferma","label":"...","body":"..."},{"tone":"domanda","label":"...","body":"..."},{"tone":"rilancio","label":"...","body":"..."}]}`;
    const userPrompt = `Thread email (ultimo messaggio = più recente):\n\n${threadText}`;
    const raw = await callClaude(sys, userPrompt, { jsonMode: true, maxTokens: 700, temperature: 0.5, ledger: ledgerCtx });
    const parsed = safeJsonParse<{ suggestions?: Array<{ tone: string; label: string; body: string }> }>(raw);
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
