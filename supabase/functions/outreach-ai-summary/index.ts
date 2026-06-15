import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

/**
 * outreach-ai-summary — il SUPER_ADMIN ottiene, dentro la Posta cold, un
 * RIEPILOGO della conversazione con un prospect: una frase di sintesi (cosa vuole
 * / a che punto siamo), un hint sull'intento e una bozza di risposta pronta da
 * usare. Pensata per il pannello "Contesto lead": un colpo d'occhio prima di
 * rispondere.
 *
 * Riceve il thread GIÀ ricostruito dal client (messages[]), così non duplica le
 * query del hook condiviso; contactId/conversationKey sono solo per contesto/log.
 *
 * Strumento interno di piattaforma: aiRouterComplete con skipCharge:true
 * (la "Platform Admin CRM" non ha metodo di pagamento → il gate carta darebbe
 * 500). Stesso pattern di outreach-ai-reply / outreach-ai-sequence.
 *
 * Body: { contactId? , conversationKey? , messages: ThreadMsg[] }
 *   ThreadMsg = { direction: "out"|"in", subject?, body?, intent?, at? }
 *
 * Best-effort: qualunque problema (AI giù, JSON non valido, thread vuoto) →
 * 200 con campi vuoti. Mai 5xx per non rompere la UI del pannello.
 * Output: { summary: string, intent_hint: string, suggested_reply: string }
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `Sei un assistente vendite B2B in italiano per "Edilizia in Cloud", il gestionale cloud per imprese edili (fatturazione elettronica, gestione cantieri, DDT, preventivi, controllo costi e margini).

Ti viene data una conversazione email a freddo tra "Noi" (Edilizia in Cloud) e un "Prospect", in ordine cronologico. Devi produrre, per chi gestisce la casella, un RIEPILOGO operativo per decidere come rispondere.

Restituisci SOLO un oggetto JSON valido, senza testo attorno, con ESATTAMENTE questi campi:
{"summary": "...", "intent_hint": "...", "suggested_reply": "..."}

REGOLE:
- "summary": UNA frase in italiano (max ~25 parole) che dica a che punto è la conversazione e cosa vuole/chiede il prospect nell'ultimo messaggio. Niente preamboli tipo "Il prospect…": vai dritto al punto.
- "intent_hint": 2-4 parole in italiano che etichettano l'atteggiamento dell'ultima risposta del prospect (es. "interessato, vuole una call", "ha una domanda sui prezzi", "non interessato", "fuori sede", "chiede di essere ricontattato"). Se non c'è ancora una risposta del prospect, usa "in attesa di risposta".
- "suggested_reply": una bozza di risposta breve (40-80 parole), in italiano, tono professionale ma umano e diretto, che risponda all'ultimo messaggio del prospect e proponga UN solo passo successivo soft (di solito una breve call). Niente link, niente allegati, niente emoji, niente markdown, niente firma finale, nessun oggetto. Se non c'è ancora una risposta del prospect, proponi un follow-up gentile.
- Non inventare MAI dati, numeri, prezzi o fatti non presenti nel thread.`;

interface ThreadMsg {
  direction?: string | null;
  subject?: string | null;
  body?: string | null;
  intent?: string | null;
  at?: string | null;
}

interface SummaryOut {
  summary: string;
  intent_hint: string;
  suggested_reply: string;
}

const EMPTY: SummaryOut = { summary: "", intent_hint: "", suggested_reply: "" };

/** Rimuove tag HTML dalle email inviate (corpo HTML nostro) per il prompt. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Ricostruisce il thread in ordine cronologico (più vecchio → più recente) a
 * partire dai messaggi inviati dal client. Tollerante: ordina per `at` quando
 * presente, altrimenti mantiene l'ordine d'arrivo.
 */
function buildThread(messages: ThreadMsg[]): { text: string; lastIntent: string | null } {
  const lines = messages
    .map((m, i) => {
      const who = m.direction === "out" ? "Noi" : "Prospect";
      const at = m.at ? new Date(m.at).getTime() : Number.NaN;
      const raw = (m.body ?? "").trim();
      // Le inviate sono HTML nostro; le risposte sono già testo/snippet.
      const text = m.direction === "out" ? stripHtml(raw) : raw;
      return { idx: i, at, who, subject: m.subject ?? null, text, intent: m.intent ?? null };
    })
    .filter((l) => l.text.length > 0 || l.subject);
  lines.sort((a, b) => {
    const at = Number.isNaN(a.at) ? a.idx : a.at;
    const bt = Number.isNaN(b.at) ? b.idx : b.at;
    return at - bt;
  });
  const lastReply = [...lines].reverse().find((l) => l.who === "Prospect");
  const text = lines
    .map((l) => {
      const subj = l.subject ? ` (oggetto: ${l.subject})` : "";
      return `${l.who}${subj}:\n${l.text || "—"}`;
    })
    .join("\n\n---\n\n");
  return { text, lastIntent: lastReply?.intent ?? null };
}

/**
 * Parsing robusto del JSON dalla risposta del modello: tollera fence ```json,
 * prosa attorno, ed estrae il primo blocco {...} bilanciato (string-aware).
 * Stesso spirito di extractJson in aiRouter.ts / outreach-ai-sequence.
 */
function extractJsonObject(text: string): unknown | undefined {
  if (!text) return undefined;
  const raw = text.trim();
  try { return JSON.parse(raw); } catch { /* continua */ }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* continua */ }
  }
  const start = raw.indexOf("{");
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(raw.slice(start, i + 1)); } catch { return undefined; }
        }
      }
    }
  }
  return undefined;
}

/** Normalizza l'output del modello nei tre campi attesi (stringhe pulite). */
function normalizeSummary(parsed: unknown): SummaryOut {
  if (!parsed || typeof parsed !== "object") return { ...EMPTY };
  const o = parsed as Record<string, unknown>;
  const clean = (v: unknown): string => {
    let t = String(v ?? "").trim();
    // toglie virgolette che racchiudono l'intero valore
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("«") && t.endsWith("»"))) {
      t = t.slice(1, -1).trim();
    }
    return t;
  };
  return {
    summary: clean(o.summary).slice(0, 400),
    intent_hint: clean(o.intent_hint).slice(0, 80),
    suggested_reply: clean(o.suggested_reply).slice(0, 1200),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const messages: ThreadMsg[] = Array.isArray(body?.messages) ? body.messages : [];

    // Niente thread → riepilogo vuoto (200, la UI mostra lo stato neutro).
    if (messages.length === 0) return jsonResponse({ ...EMPTY }, 200, corsH);

    const thread = buildThread(messages);
    if (!thread.text.trim()) return jsonResponse({ ...EMPTY }, 200, corsH);

    const userPrompt = [
      "Ecco la conversazione finora con il prospect, in ordine cronologico (la più recente in fondo).",
      "Produci il riepilogo JSON richiesto.",
      thread.lastIntent ? `Intento già rilevato sull'ultima risposta del prospect: ${thread.lastIntent}` : "",
      "",
      "=== CONVERSAZIONE ===",
      thread.text,
      "=== FINE CONVERSAZIONE ===",
    ].filter(Boolean).join("\n");

    // Best-effort: se l'AI fallisce (router error, modelli giù, ecc.) non
    // propaghiamo 5xx — torniamo campi vuoti così il pannello non si rompe.
    let result;
    try {
      result = await aiRouterComplete({
        supabase: admin,
        taskKey: "outreach_ai_summary",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.5, max_tokens: 400 },
        responseFormat: { type: "json_object" },
        companyId: PLATFORM_COMPANY,
        userId,
        // Strumento interno di piattaforma: nessun gate carta / precheck credito
        // per-tenant (vedi outreach-ai-reply per il razionale completo).
        skipCharge: true,
      });
    } catch (aiErr) {
      console.warn("outreach-ai-summary: AI non disponibile:", aiErr instanceof Error ? aiErr.message : aiErr);
      return jsonResponse({ ...EMPTY }, 200, corsH);
    }

    if (result.chargeSkipped && result.prechargeReason && result.prechargeReason !== "cache_hit") {
      // Precheck/credito ha bloccato la chiamata: torna vuoto, niente crash UI.
      return jsonResponse({ ...EMPTY }, 200, corsH);
    }

    const parsed = extractJsonObject(result.content || "");
    const out = normalizeSummary(parsed);
    return jsonResponse({ ...out, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    // Errori di auth (super_admin) sono Response e vanno propagati così come sono.
    if (e instanceof Response) return e;
    console.error("outreach-ai-summary error:", e);
    // Best-effort anche sull'imprevisto: campi vuoti, 200.
    return jsonResponse({ ...EMPTY }, 200, corsH);
  }
});
