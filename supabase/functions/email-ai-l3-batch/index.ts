/**
 * email-ai-l3-batch — MP-EMAIL-AI-01 · Livello 3 (Haiku batch)
 *
 * Edge function che classifica un batch di 15-20 email tramite UN SOLA
 * chiamata a claude-haiku-4-5 con prompt caching.
 *
 * Strategia costo:
 *   - 1 sola request per batch (vs N request per N email) → -95% overhead
 *   - System prompt CACHED (ephemeral): tassonomia + few-shot. Cost token
 *     della cache = 1/10 di quelli normali dopo il primo hit.
 *   - JSON rigido in output: parsabile senza altri giri.
 *   - Confidenza < 0.6 ⇒ categoria='altro' + da_rivedere=true.
 *
 * Endpoint POST:
 *   { mode: "live", company_id?: uuid, limit?: number, dry_run?: boolean }
 *   { mode: "single", email_ids: uuid[] }   // chiamato dopo L1 miss
 *
 * Auth: x-cron-secret OR super_admin/company_admin JWT.
 *
 * Output:
 *   {
 *     batched: number,        // quante email nel batch
 *     classified: number,     // quante risolte con confidenza >= 0.6
 *     da_rivedere: number,    // quante sotto soglia (altro + da_rivedere)
 *     cost_tokens_input: number,
 *     cost_tokens_output: number,
 *     cost_tokens_cache_read: number,
 *     cost_tokens_cache_write: number,
 *   }
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { claudeMessages, hasClaudeProvider, claudeMessagesBilled } from "../_shared/claudeProxy.ts";
import { precallCheck } from "../_shared/ai-provider/billing.ts";
import {
  persistClassification,
  learnSender,
  extractSnippet,
  extractDomain,
  normalizeEmail,
  type ClassificationResult,
  type EmailCategoria,
} from "../_shared/email-ai-cascade.ts";

import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Configurazione batch (può finire in DB se variabile)
const BATCH_SIZE = 18; // batch ottimale Haiku (≤ 200K context)
const HAIKU_MODEL = "claude-haiku-4-5";
const SOGLIA_CONFIDENZA = 0.6;

const VALID_CATEGORIE: EmailCategoria[] = [
  "cliente", "fornitore", "operaio", "preventivo", "fattura",
  "opportunita", "supporto", "pratica", "newsletter", "social",
  "notifica", "spam", "altro",
];

// ════════════════════════════════════════════════════════════════════════════
// System prompt (cacheable ephemeral)
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sei un classificatore esperto di email per imprese edili italiane.

Per ogni email in input devi restituire UN OGGETTO JSON con:
- categoria: una di [cliente|fornitore|operaio|preventivo|fattura|opportunita|supporto|pratica|newsletter|social|notifica|spam|altro]
- confidenza: numero 0.00-1.00 (sicurezza nella categoria scelta)

═══ DEFINIZIONI CATEGORIE ═══

cliente — email DA un cliente attivo (richiesta info su stato lavori, conferma appuntamento, follow-up post vendita)
fornitore — email DA un fornitore (DDT, conferma ordine, comunicazioni operative, listini, RDA)
operaio — email DA un operaio o relativa a HR cantiere (ferie, malattie, busta paga, visita medica, formazione sicurezza, DPI)
preventivo — richiesta di preventivo/offerta/sopralluogo/computo/capitolato (PRIMA della commessa)
fattura — fattura attiva/passiva, nota credito, SDI, proforma, sollecito pagamento, scadenze
opportunita — nuovo LEAD potenziale cliente, richiesta da sito/form/google/social, primo contatto
supporto — richiesta supporto tecnico, ticket numerato, segnalazione bug/problema operativo
pratica — pratiche amministrative (AdE, INPS, INAIL, Cassa Edile, DURC, CILA, SCIA, F24, ENEA, PEC istituzionali, Comune)
newsletter — newsletter editoriali, magazine, webinar inviti, blog post (NON commerciale aggressivo)
social — notifiche da LinkedIn/Facebook/Instagram/TikTok (mai operative)
notifica — notifiche automatiche di sistema (delivery report, conferma iscrizione, ricevute web, mailer-daemon)
spam — promo aggressive, scam, phishing, casino, viagra
altro — non rientra in nessuna delle precedenti (RARO — se non sicuro, scegli altro)

═══ REGOLA PRIORITARIA ═══

Distingui sempre:
- newsletter = informativo/editoriale (valore per il lettore)
- spam = invasivo/promo aggressivo (rumore, no-value)
- notifica = automatica di sistema
- social = piattaforma social verticale

Se l'email è ambigua tra 2 categorie, usa confidenza ~0.5-0.6 (sarà revisione manuale).

═══ FORMATO OUTPUT ═══

DEVI restituire SOLO un array JSON, niente testo aggiuntivo. Nessun markdown, nessun commento.
Schema:

[
  { "id": "<email_id>", "categoria": "<una-delle-13>", "confidenza": <0.00-1.00> }
]

L'ordine dell'array deve rispecchiare l'ordine delle email in input.

═══ ESEMPI FEW-SHOT ═══

Input:
[
  {"id":"e1","from":"info@fornitore-cementi.it","subject":"DDT 234 - consegna cemento via Roma","snippet":"In allegato documento di trasporto per la consegna prevista domani."},
  {"id":"e2","from":"newsletter@edilportale.it","subject":"Le novità della settimana in edilizia","snippet":"Top 5 articoli del settore. Leggi sul nostro sito."},
  {"id":"e3","from":"sandro.bianchi@gmail.com","subject":"Buongiorno, richiesta sopralluogo","snippet":"Vorrei un preventivo per ristrutturazione bagno. Sono libero giovedì pomeriggio."}
]

Output:
[
  {"id":"e1","categoria":"fornitore","confidenza":0.95},
  {"id":"e2","categoria":"newsletter","confidenza":0.95},
  {"id":"e3","categoria":"preventivo","confidenza":0.90}
]`;

// ════════════════════════════════════════════════════════════════════════════
// Handler
// ════════════════════════════════════════════════════════════════════════════

// A pg_net (i cron) si risponde entro pochi secondi: vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("email-ai-l3-batch", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!hasClaudeProvider()) {
    return json({ error: "AI provider missing (OPENROUTER_API_KEY)" }, 500, corsHeaders);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();

    // Auth: cron/servizio (segreto del cron o chiave di servizio esatta, senza
    // leggere il ruolo da un JWT non firmato — la funzione è verify_jwt=false),
    // oppure super_admin a mano. Prima bastava un JWT valido qualunque per
    // riclassificare le email di qualunque azienda (26/09/2026).
    if (!chiamataInternaValida(req)) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const uid = u?.user?.id;
      const { data: sa } = uid
        ? await supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "super_admin").maybeSingle()
        : { data: null };
      if (!sa) return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // ─── Selezione email da batchare ──────────────────────────────────────
    const limit = Math.min(body.limit || BATCH_SIZE, BATCH_SIZE);
    let rows: any[];
    const creditoAzienda = new Map<string, boolean>();
    const senzaCredito: string[] = [];

    if (body.mode === "single" && Array.isArray(body.email_ids)) {
      const { data } = await supabase
        .from("email_inbox")
        .select("id, company_id, from_email, from_name, subject, raw_text, raw_html")
        .in("id", body.email_ids.slice(0, BATCH_SIZE));
      rows = data || [];
    } else {
      // Mode "live" o backfill: prendi le email senza categoria, ma solo delle
      // aziende che passano il controllo del credito. Prima le email di
      // un'azienda a credito zero tornavano a ogni giro e occupavano tutto il
      // lotto: quelle delle altre aziende non venivano mai classificate.
      rows = [];
      for (let giro = 0; giro < 4 && rows.length === 0; giro++) {
        let q: any = supabase
          .from("email_inbox")
          .select("id, company_id, from_email, from_name, subject, raw_text, raw_html")
          .is("categoria", null)
          .not("company_id", "is", null)
          .order("received_at", { ascending: false })
          .limit(200);
        if (body.company_id) q = q.eq("company_id", body.company_id);
        if (senzaCredito.length > 0) q = q.not("company_id", "in", `(${senzaCredito.join(",")})`);
        const { data } = await q;
        if (!data || data.length === 0) break;
        for (const c of new Set<string>(data.map((r: any) => r.company_id))) {
          if (creditoAzienda.has(c)) continue;
          const pre = await precallCheck(supabase, { company_id: c, task_kind: "email_ai_l3_batch" as never, estimated_tokens_total: 4000 });
          creditoAzienda.set(c, pre.allow);
          if (!pre.allow) senzaCredito.push(c);
        }
        rows = data.filter((r: any) => creditoAzienda.get(r.company_id)).slice(0, limit);
      }
    }

    if (rows.length === 0) {
      return json({ batched: 0, classified: 0, da_rivedere: 0, aziende_senza_credito: senzaCredito, message: "Nessuna email da classificare" }, 200, corsHeaders);
    }

    // ─── Un batch per azienda ──────────────────────────────────────────────
    // Prima un batch mescolava le email di aziende diverse e la chiamata
    // partiva con companyId null: 218 batch in 30 giorni pagati dalla
    // piattaforma e mai addebitati (misura del 15/11/2026). Ora ogni azienda
    // ha la sua chiamata, il suo controllo del credito e il suo addebito.
    const perAzienda = new Map<string, any[]>();
    for (const r of rows) {
      if (!r.company_id) continue;
      const g = perAzienda.get(r.company_id) ?? [];
      g.push(r);
      perAzienda.set(r.company_id, g);
    }

    let classified = 0;
    let da_rivedere_count = 0;
    const results: Array<{ id: string; categoria: EmailCategoria; confidenza: number; da_rivedere: boolean }> = [];
    const usages: Record<string, unknown> = {};
    const saltate: Array<{ company_id: string; motivo: string }> = [];
    const apiStart = Date.now();

    for (const [companyId, righe] of perAzienda) {
      const userBatchInput = righe.map((r) => ({
        id: r.id,
        from: normalizeEmail(r.from_email || ""),
        subject: (r.subject || "").slice(0, 200),
        snippet: extractSnippet(r.raw_text, r.raw_html),
      }));

      const response = await claudeMessagesBilled({
        model: HAIKU_MODEL,
        max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(userBatchInput) }],
        temperature: 0,
      }, {
        // Nessuna chiave del lavoro: un batch ripassato richiama il provider e va
        // pagato; la chiave la dà l'id della generazione (una generazione = un addebito).
        supabase, companyId, taskKind: "email_ai_l3_batch",
      });

      if (!response.ok) {
        // Credito finito (402) o errore del provider: si salta l'azienda, le
        // sue email restano senza categoria e ripassano al prossimo giro.
        saltate.push({ company_id: companyId, motivo: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` });
        continue;
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || "[]";
      usages[companyId] = data.usage || {};

      let parsed: Array<{ id: string; categoria: string; confidenza: number }>;
      try {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (!arrayMatch) throw new Error("No JSON array in response");
        parsed = JSON.parse(arrayMatch[0]);
      } catch (e) {
        console.error("[email-ai-l3-batch] Parse error", content);
        saltate.push({ company_id: companyId, motivo: `JSON non leggibile: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }

      for (const item of parsed) {
        if (!item.id) continue;
        const row = righe.find((r) => r.id === item.id);
        if (!row) continue;

        const categoria: EmailCategoria = VALID_CATEGORIE.includes(item.categoria as EmailCategoria)
          ? (item.categoria as EmailCategoria)
          : "altro";

        const confidenza = Math.max(0, Math.min(1, Number(item.confidenza) || 0));
        const da_rivedere = confidenza < SOGLIA_CONFIDENZA;

        const result: ClassificationResult = {
          categoria: da_rivedere ? "altro" : categoria,
          entita_tipo: null,
          entita_id: null,
          confidenza,
          classificato_da: "haiku",
          da_rivedere,
        };

        if (body.dry_run !== true) {
          await persistClassification(supabase, row.id, result);
          if (!da_rivedere) {
            await learnSender(supabase, row.company_id, row.from_email, result);
          }
        }

        results.push({ id: row.id, categoria: result.categoria, confidenza, da_rivedere });
        if (da_rivedere) da_rivedere_count++;
        else classified++;
      }
    }

    return json({
      batched: rows.length,
      aziende: perAzienda.size,
      classified,
      da_rivedere: da_rivedere_count,
      processed: results.length,
      results,
      saltate,
      aziende_senza_credito: senzaCredito,
      anthropic_usage: usages,
      elapsed_ms: Date.now() - apiStart,
      model: HAIKU_MODEL,
      dry_run: body.dry_run === true,
    }, 200, corsHeaders);
  } catch (e) {
    console.error("[email-ai-l3-batch] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, corsHeaders);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
