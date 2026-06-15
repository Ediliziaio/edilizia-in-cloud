import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

/**
 * outreach-ai-flow — il SUPER_ADMIN genera un GRAFO di sequenza cold condizionale
 * (non lineare) da un brief. A differenza di outreach-ai-sequence (cadenza lineare
 * { name, steps[] }), qui l'AI produce un GRAFO con nodi tipizzati e rami:
 *
 *   { name, nodes:[{key, type:'email'|'wait'|'condition'|'end', condition_type?,
 *                   subject?, body?, delay_days?, delay_hours?}],
 *           edges:[{from_key, to_key, branch:'default'|'alt'}] }
 *
 * Il client mappa key→uuid, branch→handle (default→"yes"/next_default, alt→"no"/
 * next_alt), fa auto-layout e lascia rivedere/salvare. NON si scrive nel DB qui.
 *
 * Strumento interno di piattaforma: aiRouterComplete con skipCharge:true +
 * companyId=PLATFORM_COMPANY (la "Platform Admin CRM" ha payment_method='none' →
 * il gate carta darebbe 500). Stesso pattern di outreach-ai-sequence.
 *
 * Best-effort: su errore modello / JSON invalido ritorna 200 { nodes:[], edges:[] }
 * così la UI degrada con un toast invece di rompere il builder.
 *
 * Body: { brief, brand? }.
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

type NodeType = "email" | "whatsapp" | "sms" | "wait" | "condition" | "end";
type ConditionType = "opened" | "not_opened" | "replied" | "not_replied";
type Branch = "default" | "alt";

interface AiNode {
  key: string;
  type: NodeType;
  condition_type?: ConditionType | null;
  subject?: string | null;
  body?: string | null;
  delay_days?: number | null;
  delay_hours?: number | null;
}
interface AiEdge {
  from_key: string;
  to_key: string;
  branch: Branch;
}
interface AiFlow {
  name: string;
  nodes: AiNode[];
  edges: AiEdge[];
}

function systemPrompt(): string {
  return `Sei un copywriter e sequence-designer esperto di cold outreach B2B in italiano per "Edilizia in Cloud", il gestionale cloud per imprese edili italiane (fatturazione elettronica, gestione cantieri, DDT, preventivi, controllo costi e margini).

Progetta un FLUSSO (grafo) di cold outreach CONDIZIONALE — non una semplice lista lineare, ma un grafo con rami "se/allora" basati sul comportamento del contatto.

NODI disponibili (campo "type"):
- "email": un'email da inviare. Ha "subject" (3-6 parole) e "body" (45-85 parole), più "delay_days"/"delay_hours" = attesa PRIMA di inviarla.
- "whatsapp": un messaggio WhatsApp. Ha SOLO "body" (1-3 frasi brevissime, niente oggetto) e "delay_days"/"delay_hours". Richiede il numero di telefono del contatto. Tono ancora più diretto e colloquiale dell'email.
- "sms": un SMS. Ha SOLO "body" (max ~160 caratteri, niente oggetto) e "delay_days"/"delay_hours". Richiede il numero di telefono. Brevissimo e diretto.
- "wait": un nodo di sola attesa (pausa), con "delay_days"/"delay_hours". Usalo per dare tempo al contatto di reagire prima di valutare una condizione.
- "condition": un bivio. Ha "condition_type" tra: "opened" (ha aperto l'ultima email), "not_opened" (non l'ha aperta), "replied" (ha risposto), "not_replied" (non ha risposto). NON ha testo.
- "end": nodo terminale (la sequenza si conclude).

CANALI: l'email è il canale principale. Usa nodi "whatsapp"/"sms" come follow-up multicanale (es. un promemoria SMS dopo che il contatto non ha aperto l'email), MAI come primo nodo: la radice deve essere sempre un'email. Non eccedere: al più 1-2 nodi non-email in tutto il flusso.

ARCHI (campo "edges"): ogni arco collega "from_key" → "to_key" con "branch":
- "default": il flusso normale; per una "condition" è il ramo SÌ (condizione vera).
- "alt": SOLO per le "condition", è il ramo NO (condizione falsa).
Un nodo "condition" DEVE avere esattamente 2 archi uscenti: uno "default" (SÌ) e uno "alt" (NO). I nodi email/wait hanno 1 solo arco uscente "default". I nodi "end" non hanno archi uscenti.

STRUTTURA TIPICA da seguire (adattala al brief):
1) Email di apertura (delay 0) → 2) wait di 2-3 giorni → 3) condition "not_opened":
   - ramo SÌ (non ha aperto) → email di re-invio con oggetto diverso → end
   - ramo NO (ha aperto) → email di follow-up con valore → wait → condition "replied":
       - SÌ (ha risposto) → end
       - NO → email di chiusura gentile ("breakup") → end
Lo STOP su risposta è IMPLICITO nel dispatcher: non serve un nodo per fermarsi sulla risposta, ma puoi usare la condizione "replied" per diramare prima della chiusura.

REGOLE DI SCRITTURA (per i nodi email/whatsapp/sms):
- Italiano, tono professionale ma umano e diretto. Niente "Spettabile" né formule da circolare; niente piaggeria.
- Email: oggetto 3-6 parole, corpo 45-85 parole. WhatsApp: 1-3 frasi. SMS: max ~160 caratteri. Brevissimi. UNA sola call-to-action soft (una domanda che invita a rispondere). Niente link, niente allegati, niente firma finale.
- Personalizza con {{first_name}} e {{company_name}} dove naturale; per il fallback usa {{first_name|}} o {{company_name|la vostra impresa}}.
- Puoi usare lo spintax {opzione1|opzione2} per piccole variazioni (es. "{Ciao|Salve} {{first_name|}}"), con parsimonia.
- Niente claim esagerati o percentuali inventate. Niente emoji. Niente markdown. Niente grassetti. Niente spam words (gratis, offerta, sconto, promozione, !!!).

VINCOLI SUL GRAFO:
- Da 5 a 9 nodi totali. Almeno 2 nodi d'invio (email/whatsapp/sms) e almeno 1 condition. Un solo nodo radice (la prima EMAIL, senza archi entranti).
- Ogni "key" è una stringa breve e unica (es. "email_apertura", "attesa1", "cond_aperto", "email_followup", "fine_ok").
- delay_days CRESCENTI lungo il percorso principale, primo step a 0.
- Ogni ramo deve terminare (direttamente o indirettamente) in un nodo "end".

Restituisci SOLO un oggetto JSON valido, senza testo attorno, con ESATTAMENTE questa forma:
{"name":"<nome breve della sequenza>","nodes":[{"key":"...","type":"email","subject":"...","body":"...","delay_days":0,"delay_hours":0},{"key":"...","type":"condition","condition_type":"not_opened"},{"key":"...","type":"end"}],"edges":[{"from_key":"...","to_key":"...","branch":"default"},{"from_key":"...","to_key":"...","branch":"alt"}]}`;
}

/**
 * Parsing robusto del JSON dalla risposta del modello: tollera fence ```json,
 * prosa attorno, ed estrae il primo blocco {...} bilanciato (string-aware).
 * Stesso spirito di extractJsonObject in outreach-ai-sequence.
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

const NODE_TYPES = new Set<NodeType>(["email", "whatsapp", "sms", "wait", "condition", "end"]);
const CONDITION_TYPES = new Set<ConditionType>(["opened", "not_opened", "replied", "not_replied"]);
/** Tipi di nodo INVIANTI (hanno un corpo): email + canali messaggio. */
const SEND_NODE_TYPES = new Set<NodeType>(["email", "whatsapp", "sms"]);

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normalizza+valida l'output del modello in un grafo coerente. Scarta archi
 * verso key inesistenti, dedup degli archi per (from, branch), garantisce che le
 * condition abbiano condition_type valido. Ritorna null se il grafo non ha senso
 * minimo (nessun nodo o nessuna email) → il caller degrada a { nodes:[], edges:[] }.
 */
function normalizeFlow(parsed: unknown): AiFlow | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const rawNodes = Array.isArray(o.nodes) ? o.nodes : [];
  const rawEdges = Array.isArray(o.edges) ? o.edges : [];
  if (rawNodes.length === 0) return null;

  // ── Nodi: tieni solo quelli con key valida e type noto; dedup per key ──
  const seenKeys = new Set<string>();
  const nodes: AiNode[] = [];
  for (const raw of rawNodes) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = String(r.key ?? "").trim();
    const type = String(r.type ?? "").trim() as NodeType;
    if (!key || seenKeys.has(key) || !NODE_TYPES.has(type)) continue;
    seenKeys.add(key);
    const node: AiNode = { key, type };
    if (type === "condition") {
      const ct = String(r.condition_type ?? "").trim() as ConditionType;
      node.condition_type = CONDITION_TYPES.has(ct) ? ct : "not_opened";
    }
    if (type === "email") {
      // l'oggetto esiste SOLO per l'email; whatsapp/sms hanno solo il corpo.
      node.subject = String(r.subject ?? "").trim().slice(0, 200) || null;
    }
    if (SEND_NODE_TYPES.has(type)) {
      // tutti i nodi d'invio (email/whatsapp/sms) hanno un corpo e un ritardo.
      node.body = String(r.body ?? "").trim();
    }
    if (SEND_NODE_TYPES.has(type) || type === "wait") {
      node.delay_days = clampInt(r.delay_days, 0, 365);
      node.delay_hours = clampInt(r.delay_hours, 0, 23);
    }
    nodes.push(node);
  }
  if (nodes.length === 0) return null;
  // Serve almeno un nodo d'invio (email/whatsapp/sms): un grafo senza messaggi
  // non invierebbe nulla.
  if (!nodes.some((n) => SEND_NODE_TYPES.has(n.type))) return null;

  const keys = new Set(nodes.map((n) => n.key));
  const typeByKey = new Map(nodes.map((n) => [n.key, n.type]));

  // ── Archi: scarta self-loop, key inesistenti; dedup per (from, branch) ──
  const edges: AiEdge[] = [];
  const seenEdge = new Set<string>();
  for (const raw of rawEdges) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const from = String(r.from_key ?? "").trim();
    const to = String(r.to_key ?? "").trim();
    if (!from || !to || from === to) continue;
    if (!keys.has(from) || !keys.has(to)) continue;
    if (typeByKey.get(from) === "end") continue; // end non ha uscite
    // branch: "alt" valido solo per le condition; tutto il resto è "default".
    let branch: Branch = String(r.branch ?? "").trim() === "alt" ? "alt" : "default";
    if (branch === "alt" && typeByKey.get(from) !== "condition") branch = "default";
    const sig = `${from}::${branch}`;
    if (seenEdge.has(sig)) continue; // 1 sola uscita per (source, branch)
    seenEdge.add(sig);
    edges.push({ from_key: from, to_key: to, branch });
  }

  const name = String(o.name ?? "").trim() || "Flusso AI";
  return { name: name.slice(0, 120), nodes, edges };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    const brand = typeof body?.brand === "string" ? body.brand.trim() : "";

    const userPrompt = [
      "Progetta un flusso cold condizionale (grafo) per questo caso.",
      brief
        ? `Brief / obiettivo della campagna: ${brief}`
        : "Brief / obiettivo della campagna: apertura generica al valore del gestionale per un'impresa edile (meno tempo perso su fatturazione, cantieri e burocrazia; numeri e margini sotto controllo). Dirama in base ad apertura e risposta.",
      brand ? `Brand/mittente: ${brand}.` : "",
    ].filter(Boolean).join("\n");

    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_ai_flow",
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt },
      ],
      params: { temperature: 0.7, max_tokens: 1200 },
      responseFormat: { type: "json_object" },
      companyId: PLATFORM_COMPANY,
      userId,
      // Strumento interno di piattaforma: nessun gate carta / precheck credito
      // per-tenant (vedi outreach-ai-sequence per il razionale completo).
      skipCharge: true,
    });

    // Best-effort: precharge non disponibile → degrada a grafo vuoto (la UI
    // mostra un toast, non rompe il builder).
    if (result.chargeSkipped && result.prechargeReason) {
      return jsonResponse({ name: "", nodes: [], edges: [], reason: result.prechargeReason }, 200, corsH);
    }

    const parsed = extractJsonObject(result.content || "");
    const flow = normalizeFlow(parsed);
    if (!flow) {
      return jsonResponse({ name: "", nodes: [], edges: [] }, 200, corsH);
    }

    return jsonResponse(
      { name: flow.name, nodes: flow.nodes, edges: flow.edges, model: result.modelUsed },
      200,
      corsH,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-ai-flow error:", e);
    // Best-effort anche sugli errori non previsti: grafo vuoto, niente 500 che
    // rompe il builder.
    return jsonResponse({ name: "", nodes: [], edges: [] }, 200, corsH);
  }
});
