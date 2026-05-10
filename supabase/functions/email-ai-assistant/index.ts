/**
 * email-ai-assistant — AI per email (riassumi thread + suggerisci risposte)
 *
 * Body:
 *   { action: 'summary',          thread_id: string }
 *   { action: 'reply_suggestions', thread_id: string, language?: string }
 *
 * Output:
 *   summary  → { summary: "...", action_items: [...] }
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
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string;
  raw_text: string | null;
}

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
  if (body.action !== "summary" && body.action !== "reply_suggestions") {
    return jsonRes({ ok: false, error: "action must be 'summary' or 'reply_suggestions'" }, 400);
  }

  // Carica thread + verifica ownership
  const { data: thread, error: thErr } = await supabase
    .from("email_threads")
    .select("id, user_id, subject_normalized")
    .eq("id", body.thread_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (thErr || !thread) {
    return jsonRes({ ok: false, error: "Thread not found or access denied" }, 404);
  }

  const { data: messages } = await supabase
    .from("email_inbox")
    .select("from_email, from_name, to_email, subject, received_at, raw_text")
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
