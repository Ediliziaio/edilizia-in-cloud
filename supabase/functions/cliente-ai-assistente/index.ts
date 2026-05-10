/**
 * cliente-ai-assistente — GAP 6 (AI per committente cliente finale)
 *
 * Edge function pubblica chiamata dal widget chat nel /portale/:token.
 * Il committente edile (NON utente authenticated Supabase) può chiedere:
 *   - "A che punto è il mio cantiere?"
 *   - "Quando arriva il prossimo SAL?"
 *   - "Spiegami la voce X di questa fattura"
 *   - "Quando viene il tecnico?"
 *
 * Auth:
 *   - Token portale (validato via RPC verifica_portale_token)
 *   - Nessuna sessione Supabase richiesta (pubblica come public-chat-widget)
 *
 * Body:
 *   {
 *     token: string,                  // portale magic token
 *     message: string,                // domanda utente
 *     history?: Array<{role,content}> // ultimi 6-10 messaggi (client-side state)
 *   }
 *
 * Risposta:
 *   {
 *     reply: string,
 *     model_used: string,
 *     cost_usd: number,
 *     suggestions: string[]   // 3 follow-up suggeriti (cliccabili in UI)
 *   }
 *
 * Privacy: NESSUN dato sensibile loggato (cliente potrebbe condividere
 * info personali nella domanda). Solo metadata.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi prima
// di mostrare la risposta al cliente nel portale.
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";

interface RequestBody {
  token: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface PortaleVerify {
  cliente_id: string;
  company_id: string;
  first_name?: string | null;
  last_name?: string | null;
  valido?: boolean;
}

const SYSTEM_PROMPT = `Sei l'Assistente Cliente di un'impresa edile italiana.

Stai parlando con un CLIENTE FINALE (committente del cantiere), NON con
personale aziendale. Linee guida:
  - Tono cordiale, semplice, italiano professionale ma informale
  - Mai gergo tecnico edile non spiegato
  - Mai dati interni dell'azienda (margine, costi, listino fornitori)
  - Mai giudizi su altri clienti, competitor, fornitori
  - Mai promesse di tempi/costi senza dati certi → risposta:
    "Su questo non ho visibilità diretta. Ti faccio richiamare dal
    riferimento di cantiere entro 24h."
  - Se chiede stato lavori/SAL/scadenze: usa il CONTEXT DATA fornito
  - Se chiede modifiche al preventivo: rimanda al referente
  - Se urgenza/emergenza: rimanda a contatto telefonico diretto

Output: testo plain (no markdown), max 200 parole.

Termina sempre con 3 SUGGERIMENTI per follow-up, formato:
SUGGERIMENTI:
1. [domanda breve]
2. [domanda breve]
3. [domanda breve]`;

interface CantiereContext {
  id: string;
  description: string;
  expected_date: string | null;
  status_name: string | null;
  total_amount: number | null;
  balance_amount: number | null;
}

interface FatturaContext {
  numero: string;
  importo: number;
  data_emissione: string;
  data_scadenza: string | null;
  status: string;
}

interface AppointmentContext {
  title: string;
  start_at: string;
  status: string | null;
}

async function buildClientContext(
  supa: ReturnType<typeof createClient>,
  clienteId: string,
  companyId: string,
): Promise<string> {
  const lines: string[] = [];

  // Cantieri attivi (max 5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = await (supa as any)
    .from("orders")
    .select("id, description, expected_date, total_amount, balance_amount, order_statuses(name)")
    .eq("customer_id", clienteId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (orders && orders.length > 0) {
    lines.push("CANTIERI ATTIVI:");
    for (const o of orders as Array<CantiereContext & { order_statuses?: { name: string } }>) {
      lines.push(
        `- ${o.description} (stato: ${o.order_statuses?.name ?? "—"}, prevista fine: ${o.expected_date ?? "TBD"}, saldo residuo: €${(o.balance_amount ?? 0).toFixed(2)})`,
      );
    }
  }

  // Fatture aperte (max 5)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invs } = await (supa as any)
      .from("invoices")
      .select("numero, importo_totale, data_emissione, data_scadenza, status")
      .eq("customer_id", clienteId)
      .eq("company_id", companyId)
      .neq("status", "pagata")
      .order("data_emissione", { ascending: false })
      .limit(5);
    if (invs && invs.length > 0) {
      lines.push("\nFATTURE APERTE:");
      for (const inv of invs as FatturaContext[]) {
        lines.push(
          `- N° ${inv.numero} del ${inv.data_emissione}: €${Number(inv.importo).toFixed(2)} (scadenza ${inv.data_scadenza ?? "—"}, stato: ${inv.status})`,
        );
      }
    }
  } catch {
    /* tabella invoices potrebbe non esistere su tutti i tenant */
  }

  // Appuntamenti prossimi (max 5)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appts } = await (supa as any)
      .from("appointments")
      .select("title, start_at, status")
      .eq("customer_id", clienteId)
      .eq("company_id", companyId)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(5);
    if (appts && appts.length > 0) {
      lines.push("\nPROSSIMI APPUNTAMENTI:");
      for (const a of appts as AppointmentContext[]) {
        lines.push(
          `- ${a.title} il ${a.start_at} (${a.status ?? "confermato"})`,
        );
      }
    }
  } catch { /* noop */ }

  if (lines.length === 0) return "Nessun cantiere/fattura/appuntamento attivo per questo cliente.";
  return lines.join("\n");
}

function parseSuggestions(text: string): { reply: string; suggestions: string[] } {
  // Cerca "SUGGERIMENTI:" alla fine e estrae le 3 voci
  const re = /SUGGERIMENTI:\s*\n?((?:\s*\d+\.\s*[^\n]+\n?){1,5})\s*$/i;
  const m = re.exec(text);
  if (!m) return { reply: text.trim(), suggestions: [] };
  const body = text.substring(0, m.index).trim();
  const items = m[1]
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { reply: body, suggestions: items };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body.token || !body.message || body.message.trim().length < 2) {
    return new Response(JSON.stringify({ error: "missing_token_or_message" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Verifica token portale (RPC valida_portale_token)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: verifyData, error: verifyErr } = await (supa as any).rpc(
    "valida_portale_token",
    { p_token: body.token },
  );
  if (verifyErr || !verifyData) {
    return new Response(JSON.stringify({ error: "token_invalid_or_expired" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  // RPC ritorna single row (non array) — vedi usePortaleAuth.ts pattern
  const verifyRow = Array.isArray(verifyData) ? verifyData[0] : verifyData;
  if (!verifyRow || !verifyRow.cliente_id || !verifyRow.company_id || verifyRow.valido === false) {
    return new Response(JSON.stringify({ error: "token_invalid_or_expired" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const verify = verifyRow as PortaleVerify;
  const customerName = [verify.first_name, verify.last_name].filter(Boolean).join(" ") || "il cliente";

  // 2) Build context cliente
  const clientContext = await buildClientContext(supa, verify.cliente_id, verify.company_id);

  // 3) Costruisce messages
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "system" as const, content: `CONTEXT DATA per ${customerName}:\n${clientContext}` },
    ...((body.history ?? []).slice(-6).map((m) => ({
      role: m.role,
      content: m.content.substring(0, 2000),
    }))),
    { role: "user" as const, content: body.message.substring(0, 1500) },
  ];

  // 4) AI completion via aiRouter (idempotente per token+message hash)
  const idempotencyKey = `cliente-ai-${body.token.substring(0, 16)}-${Date.now()}`;
  try {
    const result = await aiRouterComplete({
      supabase: supa,
      companyId: verify.company_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: verify.cliente_id as any, // cliente_id è in profiles, accettabile per ledger
      taskKey: "cliente_ai_assistente",
      messages,
      maxTokens: 600,
      temperature: 0.4,
      idempotencyKey,
      featureCategory: "chat",
    });

    const parsed = parseSuggestions(result.content ?? "");

    // 🛡️ Sanitize reply prima di mostrare al cliente nel portale.
    const sanitizedReply = sanitizeAnswer(parsed.reply);
    if (sanitizedReply.wasModified) {
      console.warn("[cliente-ai-assistente] CoT leak rimosso prima della risposta al cliente");
    }
    const cleanedReply = sanitizedReply.isFullyChainOfThought
      ? "Mi dispiace, non sono riuscito a formulare una risposta utile. Puoi riformulare la domanda?"
      : (sanitizedReply.cleaned || parsed.reply);

    return new Response(JSON.stringify({
      reply: cleanedReply,
      suggestions: parsed.suggestions,
      model_used: result.modelUsed,
      cost_usd: result.costRealUsd,
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cliente-ai-assistente] AI completion failed:", e);
    return new Response(JSON.stringify({
      error: "ai_unavailable",
      reply: "Mi dispiace, in questo momento non riesco a rispondere. Riprova tra qualche minuto o contatta direttamente il tuo riferimento.",
      suggestions: [],
    }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
