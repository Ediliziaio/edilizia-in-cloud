/**
 * ai-genera-automazione — genera una bozza di flusso automazione da una
 * descrizione in linguaggio naturale (audit AI 2026-06: il bottone
 * "Crea tramite AI" apriva solo un pannello guidato, non generava nulla).
 *
 * Il CLIENT passa il catalogo dei trigger/azioni disponibili (id+label+
 * description): l'AI è VINCOLATA a sceglierne tra quelli, così non può
 * inventare azioni inesistenti. Output validato server-side: trigger/azioni
 * fuori catalogo vengono scartati. Ritorna la stessa forma dei template
 * statici (nodes + connections) → il client riusa la pipeline di creazione
 * già esistente (AutomazioniTemplateGallery) con rollback.
 */
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface CatalogEntry {
  id: string;
  label: string;
  description?: string;
}
interface GenPayload {
  company_id: string;
  descrizione: string;
  triggers: CatalogEntry[];
  actions: CatalogEntry[];
}

interface GenNode {
  id: string;
  nodeType: "trigger" | "action";
  configJson: Record<string, unknown>;
  label: string;
  posX: number;
  posY: number;
}
interface GenConnection {
  fromId: string;
  toId: string;
}

const MAX_NODES = 8;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, cors);

  try {
    const auth = await requireAuth(req, cors);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    const body = (await req.json()) as GenPayload;
    const descrizione = (body?.descrizione ?? "").trim();
    const triggers = Array.isArray(body?.triggers) ? body.triggers : [];
    const actions = Array.isArray(body?.actions) ? body.actions : [];

    if (!body?.company_id) return errorResponse("company_id mancante", 400, cors);
    if (descrizione.length < 10) return errorResponse("Descrivi l'automazione in modo più completo (min 10 caratteri)", 400, cors);
    if (descrizione.length > 2000) return errorResponse("Descrizione troppo lunga (max 2000 caratteri)", 400, cors);
    if (triggers.length === 0 || actions.length === 0) return errorResponse("Catalogo trigger/azioni mancante", 400, cors);

    await requireCompanyAccess(supabaseAdmin, userId, body.company_id, cors);

    const paymentBlock = await gateAiPayment(supabaseAdmin, body.company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Set di id validi per la validazione post-AI.
    const triggerIds = new Set(triggers.map((t) => t.id));
    const actionIds = new Set(actions.map((a) => a.id));

    const triggerList = triggers.map((t) => `- ${t.id}: ${t.label}${t.description ? ` — ${t.description}` : ""}`).join("\n");
    const actionList = actions.map((a) => `- ${a.id}: ${a.label}${a.description ? ` — ${a.description}` : ""}`).join("\n");

    const systemPrompt = `Sei un assistente che progetta automazioni di workflow per un gestionale dell'edilizia.
A partire dalla descrizione dell'utente, scegli UN solo trigger e da 1 a ${MAX_NODES - 1} azioni, SOLO dagli elenchi forniti.
Non inventare id non presenti negli elenchi. Se la descrizione non è chiara, scegli l'interpretazione più utile e sicura.

TRIGGER DISPONIBILI (scegline esattamente UNO):
${triggerList}

AZIONI DISPONIBILI (scegline da 1 a ${MAX_NODES - 1}, in ordine logico):
${actionList}

Rispondi SOLO con JSON valido in questo formato esatto:
{
  "name": "<nome breve del flusso>",
  "trigger": { "id": "<id trigger>", "label": "<etichetta breve>" },
  "steps": [
    { "id": "<id azione>", "label": "<etichetta breve>" }
  ]
}
Usa esclusivamente id presenti negli elenchi. Niente testo fuori dal JSON.`;

    const aiResult = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "automation_generate",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: descrizione },
      ],
      params: { temperature: 0.3, max_tokens: 1200 },
      responseFormat: { type: "json_object" },
      companyId: body.company_id,
      userId,
    });

    // Parse robusto: estrai il primo blocco JSON.
    let parsed: {
      name?: string;
      trigger?: { id?: string; label?: string };
      steps?: Array<{ id?: string; label?: string }>;
    };
    try {
      const raw = aiResult.content.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    } catch {
      return errorResponse("L'AI non ha prodotto un flusso valido. Riprova con una descrizione più precisa.", 502, cors);
    }

    const triggerId = parsed.trigger?.id;
    if (!triggerId || !triggerIds.has(triggerId)) {
      return errorResponse("L'AI ha scelto un trigger non disponibile. Riprova.", 502, cors);
    }
    const validSteps = (parsed.steps ?? [])
      .filter((s) => s.id && actionIds.has(s.id))
      .slice(0, MAX_NODES - 1);
    if (validSteps.length === 0) {
      return errorResponse("L'AI non ha prodotto azioni valide. Riprova con una descrizione più precisa.", 502, cors);
    }

    // Costruisci nodi/connessioni nella forma dei template statici.
    const triggerLabel = triggers.find((t) => t.id === triggerId)?.label ?? "Trigger";
    const nodes: GenNode[] = [
      {
        id: "trigger-1",
        nodeType: "trigger",
        configJson: { trigger_type: triggerId },
        label: parsed.trigger?.label?.slice(0, 60) || triggerLabel,
        posX: 250,
        posY: 50,
      },
    ];
    const connections: GenConnection[] = [];
    let prevId = "trigger-1";
    validSteps.forEach((s, i) => {
      const nodeId = `action-${i + 1}`;
      const actionLabel = actions.find((a) => a.id === s.id)?.label ?? "Azione";
      nodes.push({
        id: nodeId,
        nodeType: "action",
        configJson: { action_type: s.id },
        label: s.label?.slice(0, 60) || actionLabel,
        posX: 250,
        posY: 50 + 150 * (i + 1),
      });
      connections.push({ fromId: prevId, toId: nodeId });
      prevId = nodeId;
    });

    return jsonResponse(
      {
        success: true,
        name: (parsed.name ?? "Automazione AI").slice(0, 100),
        nodes,
        connections,
      },
      200,
      cors,
    );
  } catch (e) {
    // requireAuth/requireCompanyAccess lanciano già Response 401/403: rilanciale.
    if (e instanceof Response) return e;
    console.error("[ai-genera-automazione] uncaught", e);
    return errorResponse("Errore nella generazione dell'automazione", 500, getCorsHeaders(req));
  }
});
