import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { giornoDelPassoLineare } from "../_shared/outreach-cadenza.ts";

/**
 * outreach-ai-sequence — il SUPER_ADMIN genera una CADENZA cold B2B edilizia
 * intera (N step email) da un "angle" (es. "risparmio su fatturazione e
 * cantieri"). Ritorna l'anteprima { name, steps }: la UI mostra l'anteprima e
 * poi crea la sequenza + gli step nel DB (NON si scrive nel DB qui).
 *
 * Strumento interno di piattaforma: usa aiRouterComplete con skipCharge:true
 * (la "Platform Admin CRM" non ha metodo di pagamento → il gate carta darebbe
 * 500). Stesso pattern di outreach-ai-email.
 *
 * Body: { angle, steps } — steps default 3, clamp 2..6.
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

function systemPrompt(n: number): string {
  return `Sei un copywriter esperto di cold outreach B2B in italiano per "Edilizia in Cloud", il gestionale cloud per imprese edili italiane (fatturazione elettronica, gestione cantieri, DDT, preventivi, controllo costi e margini).

Scrivi una CADENZA (sequenza) di ${n} email a freddo da inviare in successione allo stesso prospect: una prima email + follow-up. La sequenza deve aprire una conversazione, non vendere subito.

REGOLE FERREE:
- Italiano, tono professionale ma umano e diretto. Niente "Spettabile" né formule da circolare; niente piaggeria.
- ${n} step totali. Un follow-up ogni 4 giorni: delay_days è il giorno dall'inizio, 0 per il primo step e poi 4, 8, 12… (sempre 4 giorni fra uno step e il successivo).
- Ogni step ha un oggetto (subject) di 3-6 parole e un corpo (body) di 45-85 parole. Brevissimi.
- Arco narrativo tra gli step: 1) apertura/aggancio, gli intermedi aggiungono valore o prova sociale, l'ultimo è una chiusura gentile ("breakup") che lascia la porta aperta senza insistere.
- UNA sola call-to-action soft per email, una domanda che invita a rispondere (es. "ha senso sentirci 10 minuti questa settimana?"). Niente link, niente allegati.
- Personalizza con le variabili {{first_name}} e {{company_name}} dove naturale. Per il fallback usa la sintassi {{first_name|}} o {{company_name|la vostra impresa}}.
- Puoi usare lo spintax {opzione1|opzione2} per piccole variazioni (es. "{Ciao|Salve} {{first_name|}}") così ogni invio è leggermente diverso e più deliverabile. Usalo con parsimonia, solo dove suona naturale.
- Niente claim esagerati o percentuali inventate. Niente emoji. Niente markdown. Niente grassetti. Niente firma finale.
- Niente spam words (gratis, offerta, sconto, promozione, !!!).

Restituisci SOLO un oggetto JSON valido, senza testo attorno, con ESATTAMENTE questa forma:
{"name": "<nome breve e descrittivo della cadenza>", "steps": [{"delay_days": 0, "subject": "...", "body": "..."}, ...]}
L'array steps deve avere esattamente ${n} elementi.`;
}

interface AiStep { delay_days: number; subject: string; body: string }
interface AiSequence { name: string; steps: AiStep[] }

/**
 * Parsing robusto del JSON dalla risposta del modello: tollera fence ```json,
 * prosa attorno, ed estrae il primo blocco {...} bilanciato (string-aware).
 * Stesso spirito di extractJson in aiRouter.ts.
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

/** Normalizza l'output del modello in una sequenza valida (un follow-up ogni 4 giorni, campi puliti). */
function normalizeSequence(parsed: unknown, fallbackSteps: number): AiSequence | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const rawSteps = Array.isArray(o.steps) ? o.steps : [];
  if (rawSteps.length === 0) return null;

  const steps: AiStep[] = rawSteps
    .map((s) => {
      const st = (s && typeof s === "object") ? s as Record<string, unknown> : {};
      const subject = String(st.subject ?? "").trim();
      const body = String(st.body ?? "").trim();
      return { delay_days: 0, subject, body };
    })
    .filter((s) => s.body.length > 0)
    // I giorni non li decide il modello: un follow-up ogni 4 giorni (0, 4, 8…).
    .map((s, i) => ({ ...s, delay_days: giornoDelPassoLineare(i) }));

  if (steps.length === 0) return null;

  const name = String(o.name ?? "").trim() || `Cadenza AI ${steps.length} step`;
  return { name: name.slice(0, 120), steps };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const angle = typeof body?.angle === "string" ? body.angle.trim() : "";
    const requested = Number(body?.steps);
    const n = Number.isFinite(requested) ? Math.min(6, Math.max(2, Math.round(requested))) : 3;

    const userPrompt = [
      `Genera una cadenza di ${n} step.`,
      angle
        ? `Angolo/tema della campagna: ${angle}`
        : "Angolo/tema della campagna: apertura generica al valore del gestionale per un'impresa edile (meno tempo perso su fatturazione, cantieri e burocrazia; numeri e margini sotto controllo).",
    ].join("\n");

    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_ai_sequence",
      messages: [
        { role: "system", content: systemPrompt(n) },
        { role: "user", content: userPrompt },
      ],
      params: { temperature: 0.8, max_tokens: 1500 },
      responseFormat: { type: "json_object" },
      companyId: PLATFORM_COMPANY,
      userId,
      // Strumento interno di piattaforma: nessun gate carta / precheck credito
      // per-tenant (vedi outreach-ai-email per il razionale completo).
      skipCharge: true,
    });

    if (result.chargeSkipped && result.prechargeReason) {
      return errorResponse(`AI non disponibile: ${result.prechargeReason}`, 402, corsH);
    }

    const parsed = extractJsonObject(result.content || "");
    const seq = normalizeSequence(parsed, n);
    if (!seq) return errorResponse("L'AI non ha prodotto una sequenza valida, riprova", 502, corsH);

    return jsonResponse({ name: seq.name, steps: seq.steps, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-ai-sequence error:", e);
    return errorResponse("Errore nella generazione della sequenza", 500, corsH);
  }
});
